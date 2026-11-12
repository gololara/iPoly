import {ApiError,database,digest,uuid} from './data';
import {getTeacherForLanguage} from './teachers';
import {applyMemorySchema,canonical,memoryContentSchema,memoryDecisionSchema,proposeMemorySchema} from './memory-contract';
import type {MemoryContent,MemoryActorReview,MemoryProposal} from './memory-contract';
import {memoryGuard,memoryLedger} from './memory-approval-sql';
type ProposalRow={id:string;owner:string;note_id:string;version:number;content:string;content_hash:string;request_hash:string;expected_note_version:number;expected_memory_version:number;state:MemoryProposal['state'];created_at:string;applied_at:string|null;cancelled_at:string|null};
const conflict=()=>new ApiError(409,'La propuesta o sus fuentes cambiaron. Conserva el contenido, recupera la memoria y revisa una propuesta nueva.');
async function row(owner:string,id:string){uuid.parse(id);return database().prepare('SELECT id,owner,note_id,version,content,content_hash,request_hash,expected_note_version,expected_memory_version,state,created_at,applied_at,cancelled_at FROM memory_proposals p WHERE p.id=? AND p.owner=? AND EXISTS(SELECT 1 FROM notes n WHERE n.id=p.note_id AND n.owner=p.owner)').bind(id,owner).first<ProposalRow>();}
async function view(r:ProposalRow):Promise<MemoryProposal>{
 let content:MemoryContent;try{content=memoryContentSchema.parse(JSON.parse(r.content));}catch{throw conflict();}
 if(r.version!==1||r.note_id!==content.noteId||r.expected_note_version!==content.expectedNoteVersion||r.expected_memory_version!==content.expectedMemoryVersion||canonical(content)!==r.content||await hashContent(r.id,content)!==r.content_hash)throw conflict();
 return {id:r.id,proposalVersion:1,contentHash:r.content_hash,state:r.state,content,createdAt:r.created_at,appliedAt:r.applied_at,cancelledAt:r.cancelled_at};
}
export async function readMemoryProposal(owner:string,id:string){const r=await row(owner,id);if(!r)throw new ApiError(404,'No encontramos esa propuesta.');return view(r);}
export async function listMemoryProposals(owner:string,noteId:string,offset=0){
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new ApiError(400,'Página de propuestas inválida.');
 uuid.parse(noteId);const db=database();if(!await db.prepare('SELECT id FROM notes WHERE id=? AND owner=?').bind(noteId,owner).first())throw new ApiError(404,'No encontramos esa memoria.');
 const rows=(await db.prepare("SELECT p.* FROM memory_proposals p WHERE p.owner=? AND p.note_id=? AND p.state='proposed' AND json_extract(p.content,'$.classId') IS NULL ORDER BY p.created_at,p.id LIMIT 31 OFFSET ?").bind(owner,noteId,offset).all<ProposalRow>()).results;
 return {proposals:await Promise.all(rows.slice(0,30).map(view)),nextOffset:rows.length>30?offset+30:null};
}
const hashContent=(id:string,c:MemoryContent)=>digest(canonical({id,proposalVersion:1,content:c}));
async function resolveActor(owner:string,language:string,a:{role:MemoryActorReview['role'];id:string|null;name:string|null}|null):Promise<MemoryActorReview|null>{
 if(!a)return null;
 if(a.role==='user'){if(a.id!==null&&a.id!==owner)throw new ApiError(403,'El actor de usuario debe ser la cuenta autenticada.');return {...a,id:owner,profileVersion:null};}
 if(a.role==='tutor'){
  if(a.id===null)throw new ApiError(400,'El aporte de tutor necesita un perfil propio de maestro.');
  const t=await getTeacherForLanguage(owner,a.id,language);if(a.name!==null&&a.name!==t.name)throw conflict();return {...a,name:t.name,profileVersion:t.version};
 }
 if(a.id!==null)throw new ApiError(403,'Una atribución de IA o desconocida no puede reclamar una identidad de cuenta.');
 return {...a,profileVersion:null};
}
function guardFailure(e:unknown){return /memory_(?:proposal|head)_guard|UNIQUE|FOREIGN KEY/.test(String(e));}
export async function proposeMemoryContribution(owner:string,input:unknown){
 const v=proposeMemorySchema.parse(input),db=database(),requestHash=await digest(canonical(v)),previous=await row(owner,v.id);
 if(previous){if(previous.request_hash!==requestHash)throw conflict();return view(previous);}
 if(v.author.role==='tutor'&&v.recordedBy?.role!=='user')throw new ApiError(400,'Indica que la persona usuaria registró el aporte del maestro.');
 if(!v.text.trim()&&!v.attachments.length)throw new ApiError(400,'Añade texto o un adjunto guardado.');
 if(new Set(v.attachments.map(a=>a.attachmentId)).size!==v.attachments.length)throw new ApiError(400,'Cada adjunto aparece una sola vez.');
 // Read authorization before resolving any actor/media; transaction repeats it.
 const note=await db.prepare('SELECT id,language FROM notes WHERE id=? AND owner=?').bind(v.noteId,owner).first<{id:string;language:string}>();if(!note)throw new ApiError(404,'No encontramos esa memoria.');
 const attachments:MemoryContent['attachments']=[];
 for(const a of v.attachments){
  const m=await db.prepare('SELECT a.id,a.mime,a.origin,a.size,a.duration_ms,a.created_at,a.content_hash FROM attachments a JOIN notes n ON n.id=a.note_id WHERE a.id=? AND a.owner=? AND n.owner=? AND a.note_id=? AND (a.included=1 OR EXISTS(SELECT 1 FROM memory_uploads u WHERE u.attachment_id=a.id AND u.owner=a.owner AND u.note_id=a.note_id))').bind(a.attachmentId,owner,owner,v.noteId).first<{id:string;mime:string;origin:string;size:number;duration_ms:number|null;created_at:string;content_hash:string|null}>();
  if(!m)throw new ApiError(403,'El adjunto debe estar guardado en esta misma memoria y cuenta.');
  if(m.mime.startsWith('audio/')){if(!a.recordingPermission||Date.parse(a.recordingPermission.obtainedAt)>Date.parse(m.created_at)||Date.parse(a.recordingPermission.obtainedAt)>Date.now())throw new ApiError(400,'Confirma que el permiso se obtuvo antes de grabar el audio.');}
  else if(!m.mime.startsWith('image/')||a.recordingPermission)throw new ApiError(400,'Revisa el tipo y el permiso del adjunto.');
  attachments.push({...a,speaker:await resolveActor(owner,note.language,a.speaker),recordedBy:await resolveActor(owner,note.language,a.recordedBy),media:{id:m.id,mime:m.mime,origin:m.origin,size:m.size,durationMs:m.duration_ms,createdAt:m.created_at,contentHash:m.content_hash}});
 }
 if(attachments.filter(a=>a.media.mime.startsWith('audio/')).length>1||attachments.filter(a=>a.media.mime.startsWith('image/')).length>4)throw new ApiError(400,'Hasta cuatro fotos y un audio ya guardados.');
 const {id:proposalId,...payload}=v;
 const c=memoryContentSchema.parse({...payload,author:await resolveActor(owner,note.language,v.author),recordedBy:await resolveActor(owner,note.language,v.recordedBy),attachments});
 const contentHash=await hashContent(proposalId,c),g=memoryGuard(owner,c),now=new Date().toISOString();
 try{await db.prepare(`INSERT INTO memory_proposals(id,owner,note_id,expected_note_version,expected_memory_version,content,request_hash,content_hash,created_at,guard) VALUES(?,?,?,?,?,?,?,?,?,CASE WHEN ${g.sql} AND NOT EXISTS(SELECT 1 FROM memory_contributions WHERE id=?) THEN 1 ELSE 0 END)`).bind(v.id,owner,c.noteId,c.expectedNoteVersion,c.expectedMemoryVersion,canonical(c),requestHash,contentHash,now,...g.args,v.id).run();}
 catch(e){const same=await row(owner,v.id);if(same?.request_hash===requestHash)return view(same);if(guardFailure(e))throw conflict();throw e;}
 return readMemoryProposal(owner,v.id);
}
async function checked(owner:string,input:unknown,apply:boolean){
 const v=apply?applyMemorySchema.parse(input):memoryDecisionSchema.parse(input),r=await row(owner,v.id);if(!r)throw new ApiError(404,'No encontramos esa propuesta.');
 if(v.proposalVersion!==r.version||v.contentHash!==r.content_hash)throw conflict();
 if('approvedContent' in v){const approved=memoryContentSchema.parse(v.approvedContent);if(canonical(approved)!==r.content||await hashContent(v.id,approved)!==r.content_hash)throw conflict();}
 return {v,r,c:(await view(r)).content};
}
async function verifiedApplied(owner:string,r:ProposalRow){
 const review=await view(r),c=review.content,db=database(),ledger=memoryLedger(owner,c.noteId);
 // A replay verifies historical rows; it does not grant current file access.
 const result=await db.batch<Record<string,unknown>>([
  db.prepare(`SELECT c.id,c.owner,c.note_id,c.kind,c.text,c.context,c.author_role,c.author_id,c.author_name,c.recorder_role,c.recorded_by,c.recorder_name,c.class_id,c.state,c.approved_by,c.created_at,c.applied_at FROM memory_contributions c JOIN memory_proposals p ON p.id=c.id AND p.owner=c.owner AND p.note_id=c.note_id JOIN memory_heads h ON h.note_id=c.note_id AND h.owner=c.owner JOIN notes n ON n.id=c.note_id AND n.owner=c.owner WHERE c.id=? AND c.owner=? AND c.state='applied' AND c.approved_by=? AND p.state='applied' AND p.approved_by=? AND p.content_hash=? AND p.content=? AND p.version=? AND h.version>=? AND ${ledger.sql}`).bind(r.id,owner,owner,owner,r.content_hash,r.content,r.version,c.expectedMemoryVersion+1,...ledger.args),
  db.prepare('SELECT m.contribution_id,m.attachment_id,m.speaker_role,m.speaker_id,m.speaker_name,m.recorder_role,m.recorded_by,m.recorder_name,m.consent_at FROM memory_contribution_attachments m JOIN memory_contributions c ON c.id=m.contribution_id WHERE c.id=? AND c.owner=?').bind(r.id,owner)
 ]);
 const expected={id:r.id,owner,note_id:c.noteId,kind:c.kind,text:c.text,context:c.context,author_role:c.author.role,author_id:c.author.id,author_name:c.author.name,recorder_role:c.recordedBy?.role??null,recorded_by:c.recordedBy?.id??null,recorder_name:c.recordedBy?.name??null,class_id:c.classId??null,state:'applied',approved_by:owner,created_at:r.created_at,applied_at:r.applied_at};
 const expectedMedia=c.attachments.map(a=>({contribution_id:r.id,attachment_id:a.attachmentId,speaker_role:a.speaker?.role??null,speaker_id:a.speaker?.id??null,speaker_name:a.speaker?.name??null,recorder_role:a.recordedBy?.role??null,recorded_by:a.recordedBy?.id??null,recorder_name:a.recordedBy?.name??null,consent_at:a.recordingPermission?.obtainedAt??null}));
 const sorted=(rows:Record<string,unknown>[])=>rows.map(canonical).sort();
 if(canonical(result[0].results[0])!==canonical(expected)||canonical(sorted(result[1].results))!==canonical(sorted(expectedMedia)))throw conflict();
 return review;
}
export async function applyMemoryContribution(owner:string,input:unknown){
 const {v,r,c}=await checked(owner,input,true),db=database();
 if(r.state==='cancelled')throw conflict();if(r.state==='applied')return verifiedApplied(owner,r);
 if(c.classId)throw new ApiError(409,'Este borrador pertenece al flujo anterior. Crea un aporte directamente en la memoria.');
 const g=memoryGuard(owner,c),now=new Date().toISOString();
 const statements=[db.prepare(`INSERT INTO memory_heads(note_id,owner,version,guard) VALUES(?,?,?,CASE WHEN ${g.sql} AND EXISTS(SELECT 1 FROM memory_proposals WHERE id=? AND owner=? AND state='proposed' AND content_hash=? AND content=? AND note_id=? AND version=? AND expected_note_version=? AND expected_memory_version=?) THEN 1 ELSE 0 END) ON CONFLICT(note_id) DO UPDATE SET version=excluded.version,guard=excluded.guard WHERE memory_heads.owner=excluded.owner`).bind(c.noteId,owner,c.expectedMemoryVersion+1,...g.args,v.id,owner,v.contentHash,r.content,c.noteId,r.version,c.expectedNoteVersion,c.expectedMemoryVersion),
  db.prepare("INSERT INTO memory_contributions(id,owner,note_id,kind,text,context,author_role,author_id,author_name,recorder_role,recorded_by,recorder_name,state,approved_by,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'applied',?,?,?)").bind(v.id,owner,c.noteId,c.kind,c.text,c.context,c.author.role,c.author.id,c.author.name,c.recordedBy?.role??null,c.recordedBy?.id??null,c.recordedBy?.name??null,owner,r.created_at,now),
  ...c.attachments.map(a=>db.prepare('INSERT INTO memory_contribution_attachments(contribution_id,attachment_id,speaker_role,speaker_id,speaker_name,recorder_role,recorded_by,recorder_name,consent_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(v.id,a.attachmentId,a.speaker?.role??null,a.speaker?.id??null,a.speaker?.name??null,a.recordedBy?.role??null,a.recordedBy?.id??null,a.recordedBy?.name??null,a.recordingPermission?.obtainedAt??null)),
  db.prepare("UPDATE memory_proposals SET state='applied',applied_at=?,approved_by=? WHERE id=? AND owner=? AND state='proposed' AND content_hash=?").bind(now,owner,v.id,owner,v.contentHash)];
 try{await db.batch(statements);}catch(e){const same=await row(owner,v.id);if(same?.state==='applied'&&same.content_hash===v.contentHash&&same.content===r.content)return verifiedApplied(owner,same);if(guardFailure(e))throw conflict();throw e;}
 return readMemoryProposal(owner,v.id);
}
export async function cancelMemoryContribution(owner:string,input:unknown){
 const {v,r}=await checked(owner,input,false);if(r.state==='applied')throw conflict();if(r.state==='cancelled')return view(r);
 await database().prepare("UPDATE memory_proposals SET state='cancelled',cancelled_at=? WHERE id=? AND owner=? AND state='proposed' AND content_hash=? AND content=? AND note_id=? AND version=? AND expected_note_version=? AND expected_memory_version=? AND EXISTS(SELECT 1 FROM notes n WHERE n.id=memory_proposals.note_id AND n.owner=memory_proposals.owner)").bind(new Date().toISOString(),v.id,owner,v.contentHash,r.content,r.note_id,r.version,r.expected_note_version,r.expected_memory_version).run();
 const current=await readMemoryProposal(owner,v.id);if(current.state!=='cancelled')throw conflict();return current;
}
