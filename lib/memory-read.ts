import {memoryLedger} from './memory-approval-sql';
import {projectAttributions} from './attribution-projection';
import type {AttributionRow} from './attribution-contract';
import {ownedMemoryClassSql} from './memory-source-sql';
import {ApiError,database,getNote,uuid} from './data';
import {appliedDebriefSql} from './review-sql';
import type {Attachment} from './model';
import type {MemoryActor,MemoryClassContext,MemoryEntry,MemoryMedia,MemoryRole,UnifiedMemory} from './memory-model';

const unknown=():MemoryActor=>({role:'unknown',id:null,name:null});
const recorder=(id:string,name:string|null=null):MemoryActor=>({role:'user',id,name});
const actor=(role:MemoryRole|null,id:string|null,name:string|null):MemoryActor|null=>
 role!==null||id!==null||name!==null?{role:role??'unknown',id,name}:null;
const legacyMedia=(a:Attachment):MemoryMedia=>({...a,speaker:null,recordedBy:null,consentRecordedAt:null});
const conflict=()=>new ApiError(409,'Memory history could not be reconstructed safely.');
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw conflict();
 return value as Record<string,unknown>;
}
function parse(value:string){try{return object(JSON.parse(value));}catch{throw conflict();}}
function instant(value:string){const time=Date.parse(value);if(!Number.isFinite(time))throw conflict();return time;}
// Only genuine owned class identities may be exposed, not a dangling session row.
const ownedClass=(column:string)=>ownedMemoryClassSql(column,'?');
type Revision={id:string;version:number;content:string;created_at:string};
type Applied={id:string;created_at:string;applied_at:string|null;clarified:string;title:string|null;expected_version:number};
type Closing=Applied & {has_change:number;preparation_id:string|null;class_id:string|null;relation:'source'|'preparation_reference'};
type Contribution={id:string;kind:string;text:string;context:string;author_role:MemoryRole;author_id:string|null;author_name:string|null;recorder_role:MemoryRole|null;recorded_by:string|null;recorder_name:string|null;class_id:string|null;created_at:string;applied_at:string};
type LinkedMedia=Attachment & {contribution_id:string;speaker_role:MemoryRole|null;speaker_id:string|null;speaker_name:string|null;recorder_role:MemoryRole|null;recorded_by:string|null;recorder_name:string|null;consent_at:string|null};

// Owner-scoped, read-only projection. Historical sources are not migrated or copied.
export async function readMemory(owner:string,id:string):Promise<UnifiedMemory>{
 uuid.parse(id);
 // Reuse the exact legacy DTO and authentication/ownership contract.
 const note=await getNote(owner,id),db=database(),entries:MemoryEntry[]=[],classContexts:MemoryClassContext[]=[],ledger=memoryLedger(owner,id);
 // One SELECT-only batch keeps all history/media queries together and eliminates
 // the former query per contribution. The guard rejects a changed legacy DTO.
 const results=await db.batch([
  db.prepare(`SELECT n.version,${appliedDebriefSql('n.id','n.owner')} reviewed FROM notes n WHERE n.id=? AND n.owner=?`).bind(id,owner),
  db.prepare(`SELECT d.id,d.created_at,d.applied_at,json_extract(c.value,'$.clarified') clarified,json_extract(c.value,'$.title') title,json_extract(c.value,'$.expectedVersion') expected_version FROM debriefs d,json_each(d.changes) c WHERE d.owner=? AND d.state='applied' AND json_extract(c.value,'$.noteId')=?`).bind(owner,id),
  db.prepare(`SELECT t.id,t.created_at,t.applied_at,p.id preparation_id,COALESCE(th.id,p.id) class_id,c.key IS NOT NULL has_change,json_extract(c.value,'$.clarified') clarified,json_extract(c.value,'$.title') title,json_extract(c.value,'$.expectedVersion') expected_version,
   CASE WHEN EXISTS(SELECT 1 FROM json_each(t.data,'$.references') r WHERE json_extract(r.value,'$.noteId')=?) OR EXISTS(SELECT 1 FROM json_each(t.data,'$.sourceNoteIds') r WHERE r.value=?) THEN 'source' ELSE 'preparation_reference' END relation
   FROM tutor_records t
   LEFT JOIN tutor_records p ON p.id=t.parent_id AND p.owner=t.owner AND p.kind='preparation' AND p.state='applied'
   LEFT JOIN tutor_thread_members m ON m.preparation_id=p.id AND m.owner=p.owner
   LEFT JOIN tutor_threads th ON th.id=m.thread_id AND th.owner=p.owner
   LEFT JOIN json_each(t.data,'$.changes') c ON json_extract(c.value,'$.noteId')=?
   WHERE t.owner=? AND t.kind='closing' AND t.state='applied' AND (c.key IS NOT NULL
    OR EXISTS(SELECT 1 FROM json_each(t.data,'$.references') r WHERE json_extract(r.value,'$.noteId')=?)
    OR EXISTS(SELECT 1 FROM json_each(t.data,'$.sourceNoteIds') r WHERE r.value=?)
    OR EXISTS(SELECT 1 FROM json_each(p.data,'$.references') r WHERE json_extract(r.value,'$.noteId')=?)) ORDER BY t.created_at,t.id`).bind(id,id,id,owner,id,id,id),
  db.prepare('SELECT id,version,content,created_at FROM revisions WHERE owner=? AND note_id=? ORDER BY version,id').bind(owner,id),
  db.prepare(`SELECT s.class_id,s.data FROM class_sessions s WHERE s.owner=? AND json_type(s.data,?)='object' AND (${ownedClass('s.class_id')}) ORDER BY s.class_id`).bind(owner,'$.notes."'+id+'"',owner,owner,owner),
  db.prepare(`SELECT i.entry_id,i.class_id,i.closing_id FROM class_session_integrations i JOIN tutor_records t ON t.id=i.closing_id AND t.owner=i.owner AND t.kind='closing' AND t.state='applied' WHERE i.owner=? AND i.note_id=?`).bind(owner,id),
  db.prepare(`SELECT c.id,c.kind,c.text,c.context,c.author_role,c.author_id,c.author_name,c.recorder_role,c.recorded_by,c.recorder_name,c.created_at,c.applied_at,CASE WHEN ${ownedClass('c.class_id')} THEN c.class_id ELSE NULL END class_id FROM memory_contributions c WHERE c.owner=? AND c.note_id=? AND c.state='applied' AND c.approved_by=? ORDER BY c.created_at,c.id`).bind(owner,owner,owner,owner,id,owner),
  db.prepare(`SELECT m.contribution_id,a.id,a.mime,a.size,a.origin,a.duration_ms,m.speaker_role,m.speaker_id,m.speaker_name,m.recorder_role,m.recorded_by,m.recorder_name,m.consent_at FROM memory_contribution_attachments m JOIN memory_contributions c ON c.id=m.contribution_id JOIN attachments a ON a.id=m.attachment_id JOIN notes n ON n.id=a.note_id LEFT JOIN memory_proposals p ON p.id=c.id AND p.owner=c.owner AND p.note_id=c.note_id AND p.state='applied' AND p.approved_by=c.owner WHERE c.owner=? AND c.note_id=? AND c.state='applied' AND c.approved_by=? AND a.owner=? AND n.owner=? AND a.note_id=? AND (a.included=1 OR EXISTS(SELECT 1 FROM memory_uploads u WHERE u.attachment_id=a.id AND u.owner=a.owner AND u.note_id=a.note_id) AND p.id IS NOT NULL) ORDER BY c.id,(SELECT j.key FROM json_each(p.content,'$.attachments') j WHERE json_extract(j.value,'$.attachmentId')=a.id LIMIT 1),a.created_at,a.id`).bind(owner,id,owner,owner,owner,id),
  db.prepare(`SELECT (SELECT count(*) FROM memory_contributions WHERE owner=? AND note_id=? AND state='proposed')+(SELECT count(*) FROM memory_proposals WHERE owner=? AND note_id=? AND state='proposed') total,COALESCE((SELECT version FROM memory_heads WHERE owner=? AND note_id=?),0) version,CASE WHEN ${ledger.sql} THEN 1 ELSE 0 END ledger_valid`).bind(owner,id,owner,id,owner,id,...ledger.args),
  db.prepare("SELECT a.* FROM memory_attribution_corrections a JOIN notes n ON n.id=a.note_id AND n.owner=a.owner WHERE a.owner=? AND a.note_id=? AND a.state='applied' AND a.approved_by=?").bind(owner,id,owner)
 ]);
 const rows=<T>(index:number)=>results[index].results as T[];
 const contributionVersion=rows<{version:number}>(8)[0]?.version??0;if(rows<{ledger_valid:number}>(8)[0]?.ledger_valid!==1||!Number.isSafeInteger(contributionVersion)||contributionVersion<0)throw conflict();
 const guard=rows<{version:number;reviewed:number}>(0)[0];
 if(!guard||guard.version!==note.version||guard.reviewed!==note.reviewed)throw new ApiError(409,'Memory changed while it was read. Retrieve it again.');
 const debriefs=rows<Applied>(1),closings=rows<Closing>(2),revisions=rows<Revision>(3),contributions=rows<Contribution>(6);
 const uniqueSources=(sources:Applied[])=>{const ids=new Set<string>();for(const s of sources){if(ids.has(s.id))throw conflict();ids.add(s.id);}};
 uniqueSources(debriefs);uniqueSources(closings);
 const closingChanges=closings.filter(c=>c.has_change===1),representedDebriefs=new Set<string>(),representedClosings=new Set<string>();
 const sessions=rows<{class_id:string;data:string}>(4).map(s=>{
  const notes=object(parse(s.data).notes),work=object(notes[id]);if(!Array.isArray(work.entries))throw conflict();
  const workEntries=work.entries.map((raw):Record<string,unknown>&{id:string;text:string;createdAt:string}=>{
   const e=object(raw);if(typeof e.id!=='string'||typeof e.text!=='string'||typeof e.createdAt!=='string')throw conflict();
   return {...e,id:e.id,text:e.text,createdAt:e.createdAt};
  });
  return {classId:s.class_id,reviewed:work.status==='worked',entries:workEntries};
 });
 const sessionEntryIds=new Set(sessions.flatMap(s=>s.entries.map(e=>'class:'+s.classId+':'+e.id)));
 const integrations=rows<{entry_id:string;class_id:string;closing_id:string}>(5).filter(i=>sessionEntryIds.has('class:'+i.class_id+':'+i.entry_id)&&closingChanges.some(c=>c.id===i.closing_id&&c.class_id===i.class_id));
 entries.push({id:'capture:'+id,kind:'capture',text:note.original,context:'',createdAt:note.created_at,appliedAt:null,author:recorder(owner),recordedBy:recorder(owner),source:{system:'capture',id,noteVersion:1},attachments:note.attachments.map(legacyMedia)});
 const closingSource=(c:Closing)=>({closingId:c.id,incorporatedEntryIds:integrations.filter(i=>i.closing_id===c.id).map(i=>'class:'+i.class_id+':'+i.entry_id).sort(),...(c.preparation_id?{preparationId:c.preparation_id}:{}),...(c.class_id?{classId:c.class_id}:{})});
 for(const r of revisions){
  const after=object(parse(r.content).after);
  if(after.noteId!==id||typeof after.clarified!=='string')throw conflict();
  const d=debriefs.find(d=>r.id===d.id+':'+id),c=closingChanges.find(c=>r.id===c.id+':'+id);
  if((d&&(d.clarified!==after.clarified||d.expected_version+1!==r.version))||(c&&(c.clarified!==after.clarified||c.expected_version+1!==r.version)))throw conflict();
  if(d)representedDebriefs.add(d.id);if(c)representedClosings.add(c.id);
  entries.push({id:'revision:'+r.id,kind:d?'debrief':c?'closing':'revision',text:after.clarified,context:'',createdAt:r.created_at,appliedAt:d?.applied_at??c?.applied_at??null,author:unknown(),recordedBy:recorder(owner),source:{system:'revision',id:r.id,noteVersion:r.version,...(d?{debriefId:d.id}:{}),...(c?closingSource(c):{})},attachments:[],details:typeof after.title==='string'?{title:after.title}:{}});
 }
 // Imports may retain the applied result but not a revision. Recover exactly the
 // selected memory's result, keeping the operation identity and no other notes.
 for(const d of debriefs.filter(d=>!representedDebriefs.has(d.id))){
  if(typeof d.clarified!=='string'||!Number.isInteger(d.expected_version)||d.expected_version<1)throw conflict();
  entries.push({id:'debrief:'+d.id+':'+id,kind:'debrief',text:d.clarified,context:'',createdAt:d.created_at,appliedAt:d.applied_at,author:unknown(),recordedBy:null,source:{system:'debrief',id:d.id,debriefId:d.id,noteVersion:d.expected_version+1},attachments:[],details:d.title?{title:d.title}:{}});
 }
 for(const c of closingChanges.filter(c=>!representedClosings.has(c.id))){
  if(typeof c.clarified!=='string'||!Number.isInteger(c.expected_version)||c.expected_version<1)throw conflict();
  entries.push({id:'closing:'+c.id+':'+id,kind:'closing',text:c.clarified,context:'',createdAt:c.created_at,appliedAt:c.applied_at,author:unknown(),recordedBy:null,source:{system:'closing',id:c.id,...closingSource(c),noteVersion:c.expected_version+1},attachments:[],details:c.title?{title:c.title}:{}});
 }
 // Global reported/practice text may mention several memories. Keep a private
 // class-context link rather than assigning/copying it as this memory's content.
 for(const c of closings.filter(c=>!c.has_change&&c.preparation_id&&c.class_id))classContexts.push({classId:c.class_id!,preparationId:c.preparation_id!,closingId:c.id,relation:c.relation,createdAt:c.created_at,appliedAt:c.applied_at,url:'/api/preparations/'+c.preparation_id});
 if(note.clarified&&!entries.some(e=>e.source.system!=='capture'&&e.text===note.clarified))entries.push({id:'clarified:'+id,kind:'legacy_clarification',text:note.clarified,context:'',createdAt:note.updated_at,appliedAt:null,author:unknown(),recordedBy:null,source:{system:'legacy_clarification',id,noteVersion:note.version},attachments:[]});
 for(const s of sessions){
  for(const e of s.entries){
   const integrated=integrations.find(i=>i.class_id===s.classId&&i.entry_id===e.id),name=typeof e.recordedBy==='string'?e.recordedBy:null;
   const entry:MemoryEntry={id:'class:'+s.classId+':'+e.id,kind:'class_entry',text:e.text,context:typeof e.attribution==='string'?e.attribution:'',createdAt:e.createdAt,appliedAt:null,author:unknown(),recordedBy:e.author===owner?recorder(owner,name):actor(null,null,name),source:{system:'class_session',id:e.id,classId:s.classId,...(typeof e.consultedVersion==='number'?{noteVersion:e.consultedVersion}:{}),...(integrated?{integratedByClosingId:integrated.closing_id}:{})},attachments:[],details:{examples:typeof e.examples==='string'?e.examples:'',questions:typeof e.questions==='string'?e.questions:''}};
   const duplicate=entries.find(x=>x.id===entry.id);
   if(duplicate){if(JSON.stringify(duplicate)!==JSON.stringify(entry))throw conflict();}else entries.push(entry);
  }
 }
 const mediaByContribution=new Map<string,MemoryMedia[]>();
 for(const a of rows<LinkedMedia>(7)){
  const media:MemoryMedia={id:a.id,mime:a.mime,size:a.size,origin:a.origin,duration_ms:a.duration_ms,url:'/api/files/'+a.id,speaker:actor(a.speaker_role,a.speaker_id,a.speaker_name),recordedBy:actor(a.recorder_role,a.recorded_by,a.recorder_name),consentRecordedAt:a.consent_at};
  const list=mediaByContribution.get(a.contribution_id)??[];list.push(media);mediaByContribution.set(a.contribution_id,list);
 }
 for(const c of contributions)entries.push({id:'contribution:'+c.id,kind:c.kind,text:c.text,context:c.context,createdAt:c.created_at,appliedAt:c.applied_at,author:{role:c.author_role,id:c.author_id,name:c.author_name},recordedBy:actor(c.recorder_role,c.recorded_by,c.recorder_name),source:{system:'contribution',id:c.id,...(c.class_id?{classId:c.class_id}:{})},attachments:mediaByContribution.get(c.id)??[]});
 try{await projectAttributions(entries,rows<AttributionRow>(9),debriefs,id,owner);}catch{throw conflict();}
 // Compare real instants (including offset timestamps), then stable source IDs.
 const times=new Map(entries.map(e=>[e.id,instant(e.createdAt)]));
 const contextTimes=new Map(classContexts.map(c=>[c.closingId,instant(c.createdAt)]));
 classContexts.sort((a,b)=>contextTimes.get(a.closingId)!-contextTimes.get(b.closingId)!||a.closingId.localeCompare(b.closingId));
 entries.sort((a,b)=>a.id===b.id?0:a.source.system==='capture'?-1:b.source.system==='capture'?1:times.get(a.id)!-times.get(b.id)!||a.id.localeCompare(b.id));
 return {note,entries,classContexts,contributionVersion,history:{hasAppliedDebrief:note.reviewed===1||contributions.some(c=>c.kind==='debrief'),hasClassWork:sessions.some(s=>s.reviewed)||entries.some(e=>e.source.system==='class_session'||e.source.closingId!==undefined||e.source.system==='contribution'&&e.source.classId!==undefined),hasUserContributions:contributions.some(c=>c.author_role==='user')||entries.some(e=>e.attribution&&e.author.role==='user'),hasAiContributions:contributions.some(c=>c.author_role==='ai')||entries.some(e=>e.attribution&&e.author.role==='ai'),hasTutorContributions:contributions.some(c=>c.author_role==='tutor')},pendingContributionCount:rows<{total:number}>(8)[0]?.total??0};
}
