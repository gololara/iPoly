import {teacherEditInsertSql,teacherUpdateSql} from './teacher-write-sql';
import {z} from 'zod';
import {languageId} from './language';
import {ApiError,database,digest,uuid,requireConfiguredLanguage} from './data';
import type {Teacher} from './teacher-model';
const fields={name:z.string().trim().min(1).max(120).transform(s=>s.replace(/\s+/g,' ')),languages:z.array(z.string().trim().min(1).max(60)).max(20).default([]).transform(v=>[...new Map(v.map(s=>[s.toLocaleLowerCase('es'),s])).values()])};
export const teacherCreateSchema=z.object({id:uuid,...fields,languageId}).strict();
export const teacherUpdateSchema=z.object({id:uuid,requestId:uuid,expectedVersion:z.number().int().positive(),...fields,languageId:languageId.optional(),languages:fields.languages.optional()}).strict();
type Row={id:string;name:string;language_id:string;languages:string;version:number;created_at:string;updated_at:string};
const projection='id,name,language_id,languages,version,created_at,updated_at';
const parse=(r:Row):Teacher=>({id:r.id,name:r.name,languageId:r.language_id,languages:JSON.parse(r.languages),version:r.version,createdAt:r.created_at,updatedAt:r.updated_at});
export async function getTeacher(owner:string,id:string){uuid.parse(id);const r=await database().prepare('SELECT '+projection+' FROM teachers WHERE id=? AND owner=? AND language_id IS NOT NULL').bind(id,owner).first<Row>();if(!r)throw new ApiError(404,'No encontramos ese perfil de maestro.');return parse(r);}
export async function getTeacherForLanguage(owner:string,id:string,language:string){
 const teacher=await getTeacher(owner,id);
 if(teacher.languageId!==language)throw new ApiError(400,'Elige un maestro asignado al idioma de la memoria.');
 return teacher;
}
export async function listTeachers(owner:string,language:string,offset=0){
 z.number().int().min(0).max(100000).parse(offset);
 languageId.parse(language);
 const rows=(await database().prepare('SELECT '+projection+' FROM teachers WHERE owner=? AND language_id=? ORDER BY created_at DESC,id DESC LIMIT 31 OFFSET ?').bind(owner,language,offset).all<Row>()).results;
 return {teachers:rows.slice(0,30).map(parse),nextOffset:rows.length>30?offset+30:null};
}
export async function createTeacher(owner:string,input:unknown){
 const v=teacherCreateSchema.parse(input),hash=await digest(JSON.stringify(v)),db=database(),now=new Date().toISOString();
 await requireConfiguredLanguage(owner,v.languageId);
 try{await db.prepare('INSERT INTO teachers(id,owner,name,language_id,languages,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(v.id,owner,v.name,v.languageId,JSON.stringify(v.languages),hash,now,now).run();}
 catch(e){const old=await db.prepare('SELECT request_hash FROM teachers WHERE id=? AND owner=?').bind(v.id,owner).first<{request_hash:string}>();if(old?.request_hash===hash)return getTeacher(owner,v.id);if(/UNIQUE/.test(String(e)))throw new ApiError(409,'Este identificador ya corresponde a otro perfil. Conserva tu borrador y vuelve a intentarlo desde un perfil nuevo.');throw e;}
 return getTeacher(owner,v.id);
}
export async function updateTeacher(owner:string,input:unknown){const v=teacherUpdateSchema.parse(input),db=database(),hash=await digest(JSON.stringify(v));
 const replay=async()=>{const r=await db.prepare('SELECT request_hash FROM teacher_edits WHERE id=? AND owner=?').bind(v.requestId,owner).first<{request_hash:string}>();if(!r)return null;if(r.request_hash!==hash)throw new ApiError(409,'Ese intento ya tiene otro contenido. Revisa tu borrador antes de guardar.');return getTeacher(owner,v.id);};
 const old=await replay();if(old)return old;const current=await getTeacher(owner,v.id);if(current.version!==v.expectedVersion)throw new ApiError(409,'El perfil cambió en otra ventana. Tu borrador se conserva; revisa la versión actual antes de guardar.');
 if(v.languageId!==undefined&&v.languageId!==current.languageId)throw new ApiError(409,'Este perfil ya está asignado a otro idioma. Crea otro perfil para ese idioma.');
 const now=new Date().toISOString(),after={...current,name:v.name,languages:v.languages??current.languages,version:current.version+1,updatedAt:now};
 try{await db.batch([db.prepare(teacherEditInsertSql).bind(v.requestId,owner,v.id,after.version,hash,JSON.stringify({before:current,after}),now),db.prepare(teacherUpdateSql).bind(after.name,JSON.stringify(after.languages),now,v.id,owner,v.expectedVersion)]);}catch(e){const same=await replay();if(same)return same;if(/UNIQUE/.test(String(e)))throw new ApiError(409,'El perfil cambió en otra ventana. Tu borrador se conserva; revisa la versión actual antes de guardar.');throw e;}
 return getTeacher(owner,v.id);
}
