import {languageId} from './language';
import {z} from 'zod';
import {ApiError,database,digest,getNote,uuid} from './data';
import {getTeacher,getTeacherForLanguage} from './teachers';
import {classTarget,getClassTeacher} from './class-teachers';
import {getPreparation} from './tutor';
import {canonical} from './memory-contract';
import {foldMemoryTextSql,memoryListSourceCTEs} from './memory-source-sql';
import {validClassDate} from './class-detail-model';
import type {ClassWork} from './class-session';
import {classNoteRemoved,classNoteEvidence,classRemovalReason} from './class-membership';
import type {ClassNoteEvidence} from './class-membership';
type Work={notes:Record<string,ClassWork>;activeNoteId:string|null;closedAt?:string};
type ClassRow={id:string;language:string;title:string;teacher_id:string|null;class_date:string|null;created_at:string;request_hash:string};
const conflict=()=>new ApiError(409,'La clase o una memoria cambió. Conserva tu selección y recupera el estado antes de guardar.');
const selection=z.array(z.object({noteId:uuid,expectedVersion:z.number().int().positive()}).strict()).min(1).max(30);
const command=z.object({classId:uuid,expectedVersion:z.number().int().nonnegative(),requestId:uuid}).strict();
async function context(owner:string,id:string){
 uuid.parse(id);const db=database(),direct=await db.prepare('SELECT * FROM memory_classes WHERE id=? AND owner=?').bind(id,owner).first<ClassRow>();
 let classId=id,preparationId:string|null=null,threadVersion:number|null=null,language:string,title:string,teacherId:string|null,date:string|null,createdAt:string,refs:string[]=[];
 if(direct){language=direct.language;title=direct.title;teacherId=direct.teacher_id;date=direct.class_date;createdAt=direct.created_at;}
 else{
  const current=await db.prepare(`SELECT p.id FROM tutor_records p LEFT JOIN tutor_thread_members m ON m.preparation_id=p.id AND m.owner=p.owner LEFT JOIN tutor_threads t ON t.id=m.thread_id AND t.owner=p.owner WHERE p.owner=? AND p.kind='preparation' AND p.state='applied' AND (p.id=? OR t.id=?) AND (m.preparation_id IS NULL OR t.current_preparation_id=p.id)`).bind(owner,id,id).first<{id:string}>();
  if(!current)throw new ApiError(404,'No encontramos esa clase.');preparationId=current.id;
  const target=await classTarget(owner,preparationId),p=await getPreparation(owner,preparationId),a=await getClassTeacher(owner,preparationId);classId=target.classId;threadVersion=target.thread?.version??null;language=p.preparation.data.language;title=p.preparation.data.title||'Clase preparada';teacherId=a.teacher?.id??null;createdAt=p.preparation.created_at;refs=p.preparation.data.references.map(r=>r.noteId);
  const details=await db.prepare('SELECT class_date FROM class_details WHERE class_id=? AND owner=?').bind(classId,owner).first<{class_date:string|null}>();date=details?.class_date??null;
 }
 const session=await db.prepare('SELECT version,data FROM class_sessions WHERE class_id=? AND owner=?').bind(classId,owner).first<{version:number;data:string}>();
 let work:Work;try{work=session?JSON.parse(session.data):{notes:{},activeNoteId:null};if(!work.notes||typeof work.notes!=='object'||Array.isArray(work.notes))throw Error();}catch{throw conflict();}
 const ids=[...new Set([...refs,...Object.keys(work.notes)])].filter(id=>!classNoteRemoved(work.notes[id]));if(ids.length>30)throw new ApiError(409,'La clase supera el límite de treinta memorias. Su historial sigue conservado.');
 return {classId,preparationId,threadVersion,language,title,teacherId,date,createdAt,version:session?.version??0,work,ids,direct:!!direct};
}
export async function readSimpleClass(owner:string,id:string,q=''){
 z.string().max(300).parse(q);
 const c=await context(owner,id),teacher=c.teacherId?await getTeacher(owner,c.teacherId):null,memories=[];
 const proofs=c.ids.length?await database().batch<ClassNoteEvidence>(c.ids.map(noteId=>{const p=classNoteEvidence(owner,c.classId,noteId);return database().prepare(p.sql).bind(...p.args);})):[];
 for(const [index,noteId] of c.ids.entries()){const n=await getNote(owner,noteId);if(n.language!==c.language)throw conflict();const saved=c.work.notes[noteId];memories.push({noteId,title:n.title||n.original.split('\n')[0]?.slice(0,120)||'Memoria',original:n.original,createdAt:n.created_at,noteVersion:n.version,reviewed:saved?.status==='worked',consultedVersion:saved?.snapshot.version??n.version,removalBlockedReason:classRemovalReason(saved,proofs[index].results[0])});}
 const matches=q.trim()?(await database().prepare(`WITH base AS (SELECT n.* FROM notes n WHERE n.owner=? AND n.id IN (SELECT value FROM json_each(?))),${memoryListSourceCTEs} SELECT DISTINCT note_id FROM sources WHERE instr(${foldMemoryTextSql('text')},${foldMemoryTextSql('?')})>0`).bind(owner,JSON.stringify(c.ids),q.trim()).all<{note_id:string}>()).results.map(r=>r.note_id):c.ids;
 return {matchedNoteIds:matches,id:c.classId,preparationId:c.preparationId,language:c.language,title:c.title,teacher,date:c.date,createdAt:c.createdAt,version:c.version,closedAt:c.work.closedAt??null,memories};
}
export async function listSimpleClasses(owner:string,language:string,offset=0){
 languageId.parse(language);z.number().int().nonnegative().max(100000).parse(offset);
 const rows=(await database().prepare(`WITH visible AS (
 SELECT c.id,NULL preparation_id,c.title,c.language,c.created_at,c.class_date,teacher.name teacher_name,'[]' refs FROM memory_classes c LEFT JOIN teachers teacher ON teacher.id=c.teacher_id AND teacher.owner=c.owner WHERE c.owner=? AND c.language=?
 UNION ALL SELECT COALESCE(t.id,p.id),p.id,COALESCE(json_extract(p.data,'$.title'),'Clase preparada'),json_extract(p.data,'$.language'),p.created_at,d.class_date,teacher.name,COALESCE(json_extract(p.data,'$.references'),'[]') FROM tutor_records p LEFT JOIN tutor_thread_members m ON m.preparation_id=p.id AND m.owner=p.owner LEFT JOIN tutor_threads t ON t.id=m.thread_id AND t.owner=p.owner LEFT JOIN class_teachers a ON a.class_id=COALESCE(t.id,p.id) AND a.owner=p.owner LEFT JOIN teachers teacher ON teacher.id=a.teacher_id AND teacher.owner=p.owner LEFT JOIN class_details d ON d.class_id=COALESCE(t.id,p.id) AND d.owner=p.owner WHERE p.owner=? AND p.kind='preparation' AND p.state='applied' AND json_extract(p.data,'$.language')=? AND (m.preparation_id IS NULL OR t.current_preparation_id=p.id))
 SELECT v.*,s.data FROM visible v LEFT JOIN class_sessions s ON s.class_id=v.id AND s.owner=? ORDER BY v.created_at DESC,v.id DESC LIMIT 21 OFFSET ?`).bind(owner,language,owner,language,owner,offset).all<{id:string;preparation_id:string|null;title:string;language:string;created_at:string;class_date:string|null;teacher_name:string|null;refs:string;data:string|null}>()).results;
 const classes=rows.slice(0,20).map(r=>{let work:Work,refs:{noteId:string}[];try{work=r.data?JSON.parse(r.data):{notes:{},activeNoteId:null};refs=JSON.parse(r.refs);}catch{throw conflict();}const ids=new Set([...refs.map(x=>x.noteId),...Object.keys(work.notes)].filter(id=>!classNoteRemoved(work.notes[id])));return {id:r.id,preparationId:r.preparation_id,title:r.title||'Clase preparada',language:r.language,createdAt:r.created_at,date:r.class_date,teacherName:r.teacher_name,closedAt:work.closedAt??null,total:ids.size,reviewed:[...ids].filter(id=>work.notes[id]?.status==='worked').length};});return {classes,nextOffset:rows.length>20?offset+20:null};
}
async function snapshots(owner:string,language:string,refs:z.infer<typeof selection>){
 if(new Set(refs.map(x=>x.noteId)).size!==refs.length)throw new ApiError(400,'Elige cada memoria una vez.');
 const notes=[];for(const r of refs){const n=await getNote(owner,r.noteId);if(n.language!==language)throw new ApiError(400,'Elige memorias del mismo idioma de la clase.');if(n.version!==r.expectedVersion)throw conflict();notes.push(n);}return notes;
}
const referencesGuard=`NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM notes n WHERE n.id=json_extract(r.value,'$.noteId') AND n.owner=? AND n.language=? AND n.version=json_extract(r.value,'$.expectedVersion')))`;
async function replay(owner:string,id:string,hash:string){const r=await database().prepare('SELECT class_id,request_hash FROM class_session_events WHERE id=? AND owner=?').bind(id,owner).first<{class_id:string;request_hash:string}>();if(!r)return null;if(r.request_hash!==hash)throw conflict();return readSimpleClass(owner,r.class_id);}
export async function createSimpleClass(owner:string,input:unknown){
 const v=z.object({id:uuid,language:languageId,title:z.string().trim().min(1).max(160).default('Clase'),teacherId:uuid.nullable().default(null),date:z.string().refine(validClassDate).nullable().default(null),memories:selection}).strict().parse(input),hash=await digest(canonical(v)),old=await replay(owner,v.id,hash);if(old)return old;
 const db=database(),notes=await snapshots(owner,v.language,v.memories),teacher=v.teacherId?await getTeacherForLanguage(owner,v.teacherId,v.language):null,now=new Date().toISOString(),work:Work={notes:Object.fromEntries(notes.map(n=>[n.id,{snapshot:n,status:'pending',entries:[],addedInClass:false}])),activeNoteId:notes[0].id},data=JSON.stringify(work);
 try{await db.batch([
  db.prepare(`INSERT INTO memory_classes(id,owner,language,title,teacher_id,class_date,created_at,request_hash,guard) VALUES(?,?,?,?,?,?,?,?,CASE WHEN ${referencesGuard} AND (? IS NULL OR EXISTS(SELECT 1 FROM teachers WHERE id=? AND owner=? AND version=? AND language_id=?)) AND NOT EXISTS(SELECT 1 FROM tutor_threads WHERE id=?) AND NOT EXISTS(SELECT 1 FROM tutor_records WHERE id=?) THEN 1 ELSE 0 END)`).bind(v.id,owner,v.language,v.title,v.teacherId,v.date,now,hash,JSON.stringify(v.memories),owner,v.language,v.teacherId,v.teacherId,owner,teacher?.version??0,v.language,v.id,v.id),
  db.prepare('INSERT INTO class_sessions(class_id,owner,version,data) VALUES(?,?,1,?)').bind(v.id,owner,data),db.prepare('INSERT INTO class_session_events(id,owner,class_id,version,request_hash,data,created_at) VALUES(?,?,?,1,?,?,?)').bind(v.id,owner,v.id,hash,data,now)
 ]);}catch(e){const same=await replay(owner,v.id,hash);if(same)return same;if(/CHECK|UNIQUE/.test(String(e)))throw conflict();throw e;}return readSimpleClass(owner,v.id);
}
async function persist(owner:string,v:z.infer<typeof command>,c:Awaited<ReturnType<typeof context>>,hash:string,refs:z.infer<typeof selection>,extra:D1PreparedStatement[]=[],guard:{sql:string;args:unknown[]}={sql:'1',args:[]},lifecycle=false){
 if(c.version!==v.expectedVersion)throw conflict();const db=database(),data=JSON.stringify(c.work);if(data.length>600000)throw new ApiError(400,'La clase alcanzó el límite de contenido. Conserva el borrador.');
 if(!lifecycle&&c.work.closedAt!==undefined)throw new ApiError(409,'La clase está cerrada. Reábrela antes de cambiar sus memorias o trabajo.');
 const identity=c.direct?'EXISTS(SELECT 1 FROM memory_classes WHERE id=? AND owner=?)':`EXISTS(SELECT 1 FROM tutor_records p LEFT JOIN tutor_thread_members m ON m.preparation_id=p.id AND m.owner=p.owner LEFT JOIN tutor_threads t ON t.id=m.thread_id AND t.owner=p.owner WHERE p.id=? AND p.owner=? AND p.kind='preparation' AND p.state='applied' AND (m.preparation_id IS NULL OR t.current_preparation_id=p.id AND t.id=? AND t.version=?))`;
 const identityArgs=c.direct?[c.classId,owner]:[c.preparationId,owner,c.classId,c.threadVersion];
 try{await db.batch([db.prepare(`INSERT INTO class_sessions(class_id,owner,version,data,guard) VALUES(?,?,?,?,CASE WHEN COALESCE((SELECT version FROM class_sessions WHERE class_id=? AND owner=?),0)=? AND NOT EXISTS(SELECT 1 FROM class_sessions WHERE class_id=? AND owner<>?) AND ${identity} AND ${referencesGuard} AND (${guard.sql}) THEN 1 ELSE 0 END) ON CONFLICT(class_id) DO UPDATE SET version=excluded.version,data=excluded.data,guard=excluded.guard WHERE class_sessions.owner=excluded.owner`).bind(c.classId,owner,c.version+1,data,c.classId,owner,c.version,c.classId,owner,...identityArgs,JSON.stringify(refs),owner,c.language,...guard.args),...extra,db.prepare('INSERT INTO class_session_events(id,owner,class_id,version,request_hash,data,created_at) VALUES(?,?,?,?,?,?,?)').bind(v.requestId,owner,c.classId,c.version+1,hash,data,new Date().toISOString())]);}
 catch(e){const same=await replay(owner,v.requestId,hash);if(same)return same;if(/CHECK|UNIQUE/.test(String(e)))throw conflict();throw e;}return readSimpleClass(owner,c.classId);
}
export async function addSimpleClassMemories(owner:string,input:unknown){
 const v=command.extend({memories:selection}).strict().parse(input),hash=await digest(canonical(v)),old=await replay(owner,v.requestId,hash);if(old)return old;const c=await context(owner,v.classId),notes=await snapshots(owner,c.language,v.memories);
 if(new Set([...c.ids,...notes.map(n=>n.id)]).size>30)throw new ApiError(400,'Hasta treinta memorias por clase.');for(const n of notes)if(!c.ids.includes(n.id)){if(c.work.notes[n.id])delete c.work.notes[n.id].removedAt;else c.work.notes[n.id]={snapshot:n,status:'pending',entries:[],addedInClass:true};if(!c.work.activeNoteId)c.work.activeNoteId=n.id;}return persist(owner,v,c,hash,v.memories);
}
export async function removeSimpleClassMemory(owner:string,input:unknown){
 const v=command.extend({noteId:uuid,expectedNoteVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(input),hash=await digest(canonical({operation:'class-memory-removal',...v})),old=await replay(owner,v.requestId,hash);if(old)return old;
 const c=await context(owner,v.classId);if(c.version!==v.expectedVersion)throw conflict();if(!c.ids.includes(v.noteId))throw new ApiError(404,'Esta memoria no pertenece a la clase.');
 const refs=[{noteId:v.noteId,expectedVersion:v.expectedNoteVersion}],n=(await snapshots(owner,c.language,refs))[0],proof=classNoteEvidence(owner,c.classId,v.noteId),e=await database().prepare(proof.sql).bind(...proof.args).first<ClassNoteEvidence>();
 if(!e)throw conflict();const reason=classRemovalReason(c.work.notes[n.id],e);if(reason)throw new ApiError(409,reason);
 const w=c.work.notes[n.id]??{snapshot:n,status:'pending',entries:[],addedInClass:false};w.removedAt=new Date().toISOString();c.work.notes[n.id]=w;
 if(c.work.activeNoteId===n.id)c.work.activeNoteId=c.ids.find(id=>id!==n.id)??null;
 // A contribution does not change the session version. Repeat its absence in
 // the same transaction as the tombstone and event, in both race directions.
 return persist(owner,v,c,hash,refs,[],{sql:`NOT EXISTS(SELECT 1 FROM (${proof.sql}) e WHERE e.contributions OR e.pending OR e.closings OR e.integrated)`,args:proof.args});
}
export async function setSimpleClassClosed(owner:string,input:unknown){
 const v=command.extend({closed:z.boolean(),confirmed:z.literal(true)}).strict().parse(input),hash=await digest(canonical({operation:'class-session-state',...v})),old=await replay(owner,v.requestId,hash);if(old)return old;
 const c=await context(owner,v.classId);if(c.version!==v.expectedVersion)throw conflict();
 if(v.closed===(c.work.closedAt!==undefined))throw new ApiError(409,v.closed?'Esta clase ya está cerrada. Recupera su estado.':'Esta clase ya está abierta. Recupera su estado.');
 if(v.closed)c.work.closedAt=new Date().toISOString();else delete c.work.closedAt;
 // Session completion never marks memories worked, applies a proposal, creates
 // a preparation or implies mastery. Reopening is another audited CAS event.
 return persist(owner,v,c,hash,[],[],{sql:'1',args:[]},true);
}
export async function markSimpleClassMemory(owner:string,input:unknown){
 const v=command.extend({noteId:uuid,expectedNoteVersion:z.number().int().positive(),reviewed:z.boolean()}).strict().parse(input),hash=await digest(canonical(v)),old=await replay(owner,v.requestId,hash);if(old)return old;const c=await context(owner,v.classId);if(!c.ids.includes(v.noteId))throw new ApiError(404,'Esta memoria no pertenece a la clase.');const refs=[{noteId:v.noteId,expectedVersion:v.expectedNoteVersion}],n=(await snapshots(owner,c.language,refs))[0];const w=c.work.notes[n.id]??{snapshot:n,status:'pending',entries:[],addedInClass:false};w.status=v.reviewed?'worked':'pending';c.work.notes[n.id]=w;return persist(owner,v,c,hash,refs);
}
export async function setSimpleClassTeacher(owner:string,input:unknown){
 const v=command.extend({teacherId:uuid.nullable()}).strict().parse(input),hash=await digest(canonical(v)),old=await replay(owner,v.requestId,hash);if(old)return old;const c=await context(owner,v.classId);if(!c.direct)throw new ApiError(400,'Cambia el maestro desde la asignación existente de esta preparación.');const t=v.teacherId?await getTeacherForLanguage(owner,v.teacherId,c.language):null;
 // A failed teacher CAS fails the entire session transaction as well.
 return persist(owner,v,c,hash,[],[database().prepare(`UPDATE memory_classes SET teacher_id=?,guard=CASE WHEN ? IS NULL OR EXISTS(SELECT 1 FROM teachers WHERE id=? AND owner=? AND version=? AND language_id=?) THEN 1 ELSE 0 END WHERE id=? AND owner=?`).bind(v.teacherId,v.teacherId,v.teacherId,owner,t?.version??0,c.language,c.classId,owner)]);
}
