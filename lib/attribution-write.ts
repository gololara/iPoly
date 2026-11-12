import {ApiError,database,getNote,uuid} from './data';
import {applyAttributionSchema,attributionDecisionSchema,attributionHash,attributionProposalHash,canonicalAttribution,parseAttributionRow,proposeAttributionSchema} from './attribution-contract';
import type {AttributionContent,AttributionRow,AttributionSource} from './attribution-contract';
const conflict=()=>new ApiError(409,'La fuente, versión o atribución cambió. Recupera y revisa una propuesta nueva.');
async function row(owner:string,id:string){uuid.parse(id);return database().prepare('SELECT a.* FROM memory_attribution_corrections a JOIN notes n ON n.id=a.note_id AND n.owner=a.owner WHERE a.id=? AND a.owner=?').bind(id,owner).first<AttributionRow>();}
async function view(r:AttributionRow){try{return {id:r.id,proposalVersion:1 as const,contentHash:r.content_hash,content:await parseAttributionRow(r),state:r.state,proposedBy:r.owner,createdAt:r.created_at,confirmedBy:r.approved_by,confirmedAt:r.applied_at,cancelledAt:r.cancelled_at};}catch{throw conflict();}}
export async function readAttributionProposal(owner:string,id:string){const r=await row(owner,id);if(!r)throw new ApiError(404,'No encontramos esa propuesta.');return view(r);}
export async function readAttributionSource(owner:string,noteId:string,debriefId:string){
 uuid.parse(noteId);uuid.parse(debriefId);const note=await getNote(owner,noteId),db=database();
 const d=await db.prepare("SELECT changes,created_at,applied_at FROM debriefs WHERE id=? AND owner=? AND state='applied'").bind(debriefId,owner).first<{changes:string;created_at:string;applied_at:string|null}>();
 if(!d||!d.applied_at)throw new ApiError(404,'No encontramos esa aclaración aplicada.');
 let changes:Record<string,unknown>[];try{changes=JSON.parse(d.changes);if(!Array.isArray(changes))throw Error();}catch{throw conflict();}
 const matches=changes.filter(c=>c.noteId===noteId);if(matches.length!==1)throw conflict();const c=matches[0];
 if(typeof c.clarified!=='string'||!Number.isSafeInteger(c.expectedVersion)||Number(c.expectedVersion)<1||note.version<Number(c.expectedVersion)+1)throw conflict();
 const source:AttributionSource={noteId,debriefId,noteVersion:Number(c.expectedVersion)+1,text:c.clarified,debriefCreatedAt:d.created_at,debriefAppliedAt:d.applied_at};
 const revision=await db.prepare('SELECT version,content FROM revisions WHERE id=? AND owner=? AND note_id=?').bind(debriefId+':'+noteId,owner,noteId).first<{version:number;content:string}>();
 if(revision){let after;try{after=JSON.parse(revision.content).after;}catch{throw conflict();}if(revision.version!==source.noteVersion||after?.noteId!==noteId||after?.clarified!==source.text)throw conflict();}
 const history=(await db.prepare("SELECT * FROM memory_attribution_corrections WHERE owner=? AND note_id=? AND debrief_id=? AND state='applied'").bind(owner,noteId,debriefId).all<AttributionRow>()).results;
 const remaining=new Map(history.map(r=>[r.previous_id,r]));if(remaining.size!==history.length)throw conflict();let last:string|null=null;const ordered=[];
 while(remaining.has(last)){const r:AttributionRow=remaining.get(last)!;remaining.delete(last);const v=await view(r);if(v.content.sourceContentHash!==await attributionHash(source))throw conflict();ordered.push(v);last=r.id;}
 if(remaining.size)throw conflict();return {source,sourceContentHash:await attributionHash(source),expectedNoteVersion:note.version,latestCorrectionId:last,history:ordered};
}
// This same SQL is evaluated by the single INSERT/UPDATE that writes. No
// preflight SELECT can authorize a stale/foreign source or a lost head.
function guard(owner:string,c:AttributionContent){
 const s=c.source;
 const sql=`EXISTS(SELECT 1 FROM notes n WHERE n.id=? AND n.owner=? AND n.version=? AND n.version>=?)
 AND EXISTS(SELECT 1 FROM debriefs d WHERE d.id=? AND d.owner=? AND d.state='applied' AND d.created_at=? AND d.applied_at=? AND (SELECT count(*) FROM json_each(d.changes) c WHERE json_extract(c.value,'$.noteId')=?)=1 AND EXISTS(SELECT 1 FROM json_each(d.changes) c WHERE json_extract(c.value,'$.noteId')=? AND json_extract(c.value,'$.clarified')=? AND json_extract(c.value,'$.expectedVersion')+1=?))
 AND NOT EXISTS(SELECT 1 FROM revisions r WHERE r.id=? AND (r.owner<>? OR r.note_id<>? OR r.version<>? OR json_extract(r.content,'$.after.noteId') IS NOT ? OR json_extract(r.content,'$.after.clarified') IS NOT ?))
 AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM memory_attribution_corrections WHERE owner=? AND note_id=? AND debrief_id=? AND state='applied')) OR EXISTS(SELECT 1 FROM memory_attribution_corrections p WHERE p.id=? AND p.owner=? AND p.note_id=? AND p.debrief_id=? AND p.state='applied' AND p.approved_by=? AND NOT EXISTS(SELECT 1 FROM memory_attribution_corrections child WHERE child.previous_id=p.id AND child.state='applied')))`;
 return {sql,args:[s.noteId,owner,c.expectedNoteVersion,s.noteVersion,s.debriefId,owner,s.debriefCreatedAt,s.debriefAppliedAt,s.noteId,s.noteId,s.text,s.noteVersion,s.debriefId+':'+s.noteId,owner,s.noteId,s.noteVersion,s.noteId,s.text,c.previousCorrectionId,owner,s.noteId,s.debriefId,c.previousCorrectionId,owner,s.noteId,s.debriefId,owner]};
}
const guarded=(e:unknown)=>/attribution_guard|UNIQUE|FOREIGN KEY/.test(String(e));
export async function proposeAttribution(owner:string,input:unknown){
 const v=proposeAttributionSchema.parse(input),requestHash=await attributionHash(v),old=await row(owner,v.id);if(old){if(old.request_hash!==requestHash)throw conflict();return view(old);}
 const current=await readAttributionSource(owner,v.noteId,v.debriefId);if(current.expectedNoteVersion!==v.expectedNoteVersion||current.latestCorrectionId!==v.previousCorrectionId)throw conflict();
 if(v.author.role==='user'?v.author.id!==owner:v.author.id!==null)throw new ApiError(403,'La atribución no puede reclamar otra cuenta.');
 if(v.author.role==='unknown'&&v.author.name!==null)throw new ApiError(400,'La autoría desconocida no lleva nombre.');
 const c:AttributionContent={source:current.source,sourceContentHash:current.sourceContentHash,expectedNoteVersion:v.expectedNoteVersion,previousCorrectionId:v.previousCorrectionId,author:v.author,evidence:v.evidence},g=guard(owner,c),hash=await attributionProposalHash(v.id,c);
 try{await database().prepare(`INSERT INTO memory_attribution_corrections(id,owner,note_id,debrief_id,previous_id,predecessor_key,content,content_hash,request_hash,created_at,guard) VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ${g.sql} THEN 1 ELSE 0 END)`).bind(v.id,owner,v.noteId,v.debriefId,v.previousCorrectionId,v.previousCorrectionId??'',canonicalAttribution(c),hash,requestHash,new Date().toISOString(),...g.args).run();}
 catch(e){const same=await row(owner,v.id);if(same?.request_hash===requestHash)return view(same);if(guarded(e))throw conflict();throw e;}
 return readAttributionProposal(owner,v.id);
}
async function checked(owner:string,input:unknown,apply:boolean){const v=apply?applyAttributionSchema.parse(input):attributionDecisionSchema.parse(input),r=await row(owner,v.id);if(!r)throw new ApiError(404,'No encontramos esa propuesta.');const p=await view(r);if(v.contentHash!==p.contentHash||v.proposalVersion!==p.proposalVersion||('approvedContent' in v&&canonicalAttribution(v.approvedContent)!==r.content))throw conflict();return {v,r,c:p.content};}
export async function applyAttribution(owner:string,input:unknown){
 const {v,r,c}=await checked(owner,input,true);if(r.state==='cancelled')throw conflict();if(r.state==='applied')return view(r);const g=guard(owner,c);
 try{await database().prepare(`UPDATE memory_attribution_corrections SET state='applied',applied_at=?,approved_by=?,guard=CASE WHEN ${g.sql} THEN 1 ELSE 0 END WHERE id=? AND owner=? AND state='proposed' AND content_hash=? AND content=?`).bind(new Date().toISOString(),owner,...g.args,v.id,owner,v.contentHash,r.content).run();}
 catch(e){const same=await row(owner,v.id);if(same?.state==='applied'&&same.content===r.content&&same.content_hash===v.contentHash)return view(same);if(guarded(e))throw conflict();throw e;}
 const now=await readAttributionProposal(owner,v.id);if(now.state!=='applied')throw conflict();return now;
}
export async function cancelAttribution(owner:string,input:unknown){
 const {v,r}=await checked(owner,input,false);if(r.state==='applied')throw conflict();if(r.state==='cancelled')return view(r);
 await database().prepare("UPDATE memory_attribution_corrections SET state='cancelled',cancelled_at=? WHERE id=? AND owner=? AND state='proposed' AND content_hash=? AND content=? AND EXISTS(SELECT 1 FROM notes n WHERE n.id=memory_attribution_corrections.note_id AND n.owner=memory_attribution_corrections.owner)").bind(new Date().toISOString(),v.id,owner,v.contentHash,r.content).run();
 const now=await readAttributionProposal(owner,v.id);if(now.state!=='cancelled')throw conflict();return now;
}
