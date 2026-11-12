import {ApiError,bucket,database,digest,uuid} from './data';
import {inspectAudio} from './audio';
import {memoryLedgerSql} from './memory-approval-sql';
import {z} from 'zod';
// Purpose-specific staging preserves the legacy capture and its attachment DTO.
// Object keys include the content digest; concurrent uploads never overwrite
// another payload, and only an applied owned proposal grants file access.
export async function storeMemoryMedia(owner:string,noteId:string,id:string,bytes:ArrayBuffer,kind:string,origin:string){
 uuid.parse(noteId);uuid.parse(id);z.enum(['photo','audio']).parse(kind);z.enum(['personal','imported','generated_chat']).parse(origin);
 const db=database();if(!await db.prepare('SELECT id FROM notes WHERE id=? AND owner=?').bind(noteId,owner).first())throw new ApiError(404,'No encontramos esa memoria.');
 let mime:string,duration:number|null=null;
 if(kind==='photo'){
  if(bytes.byteLength<12||bytes.byteLength>8*1024*1024)throw new ApiError(400,'Usa una foto de hasta 8 MB.');
  const b=new Uint8Array(bytes),s=String.fromCharCode(...b.slice(0,12));mime=b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b[0]===137&&s.slice(1,4)==='PNG'?'image/png':s.startsWith('RIFF')&&s.slice(8,12)==='WEBP'?'image/webp':'';if(!mime)throw new ApiError(400,'Usa una foto JPG, PNG o WebP.');
 }else{
  if(bytes.byteLength>2*1024*1024)throw new ApiError(400,'El audio supera 2 MB.');let a;try{a=inspectAudio(bytes);}catch(e){throw new ApiError(400,(e as Error).message);}mime=a.mime;duration=a.durationMs;
 }
 const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const existing=async()=>db.prepare('SELECT a.id,a.note_id,a.content_hash,a.origin,u.owner FROM attachments a LEFT JOIN memory_uploads u ON u.attachment_id=a.id WHERE a.id=? AND a.owner=?').bind(id,owner).first<{id:string;note_id:string;content_hash:string;origin:string;owner:string|null}>();
 const replay=async()=>{const a=await existing();if(!a)return null;if(a.owner!==owner||a.note_id!==noteId||a.content_hash!==contentHash||a.origin!==origin)throw new ApiError(409,'Ese adjunto ya corresponde a otro contenido. Conserva el borrador.');return {id,mime,durationMs:duration};};
 const old=await replay();if(old)return old;
 const key=(await digest(owner))+'/memory/'+id+'/'+contentHash,now=new Date().toISOString();await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
 try{await db.batch([
  db.prepare(`INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at,duration_ms,content_hash) SELECT ?,?,?,?,0,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM notes WHERE id=? AND owner=?) AND (SELECT count(*) FROM memory_uploads u JOIN attachments a ON a.id=u.attachment_id WHERE u.owner=? AND NOT EXISTS(SELECT 1 FROM memory_contribution_attachments m WHERE m.attachment_id=a.id))<30`).bind(id,owner,noteId,key,mime,bytes.byteLength,origin,now,duration,contentHash,noteId,owner,owner),
  db.prepare('INSERT INTO memory_uploads(attachment_id,owner,note_id,created_at) VALUES(?,?,?,?)').bind(id,owner,noteId,now)
 ]);}catch(e){const stored=await db.prepare('SELECT object_key FROM attachments WHERE id=? AND owner=?').bind(id,owner).first<{object_key:string}>();if(stored?.object_key!==key)await bucket().delete(key);const same=await replay();if(same)return same;if(/FOREIGN KEY/.test(String(e)))throw new ApiError(409,'Hay demasiados adjuntos pendientes. Descarta algún borrador antes de subir más.');if(/UNIQUE/.test(String(e)))throw new ApiError(409,'Ese adjunto ya existe. Revisa tu borrador.');throw e;}
 return {id,mime,durationMs:duration};
}
export async function readMemoryMedia(owner:string,id:string){
 const db=database();
 // The ledger is correlated to the media's own memory, with bound owner values.
 const a=await db.prepare(`SELECT a.object_key,a.mime,a.size FROM attachments a JOIN memory_uploads u ON u.attachment_id=a.id AND u.owner=a.owner AND u.note_id=a.note_id JOIN notes n ON n.id=u.note_id AND n.owner=u.owner WHERE a.id=? AND a.owner=? AND EXISTS(SELECT 1 FROM memory_contribution_attachments m JOIN memory_contributions c ON c.id=m.contribution_id JOIN memory_proposals p ON p.id=c.id AND p.owner=c.owner AND p.note_id=c.note_id WHERE m.attachment_id=a.id AND c.owner=a.owner AND c.note_id=a.note_id AND c.state='applied' AND c.approved_by=c.owner AND p.state='applied' AND p.approved_by=p.owner) AND ${memoryLedgerSql('?','a.note_id')}`).bind(id,owner,owner).first<{object_key:string;mime:string;size:number}>();
 if(!a)throw new ApiError(404,'No encontramos ese adjunto.');const file=await bucket().get(a.object_key);if(!file)throw new ApiError(404,'El adjunto no está disponible.');return {file,mime:a.mime,size:a.size};
}
export async function discardMemoryMedia(owner:string,id:string){
 uuid.parse(id);const db=database(),a=await db.prepare('SELECT a.object_key FROM attachments a JOIN memory_uploads u ON u.attachment_id=a.id AND u.owner=a.owner WHERE a.id=? AND a.owner=?').bind(id,owner).first<{object_key:string}>();if(!a)return;
 // Never remove a file needed by a pending decision or immutable history.
 const safe=`NOT EXISTS(SELECT 1 FROM memory_contribution_attachments m WHERE m.attachment_id=?) AND NOT EXISTS(SELECT 1 FROM memory_proposals p,json_each(p.content,'$.attachments') j WHERE p.owner=? AND p.state IN ('proposed','applied') AND json_extract(j.value,'$.attachmentId')=?)`;
 const result=await db.batch([db.prepare(`DELETE FROM memory_uploads WHERE attachment_id=? AND owner=? AND ${safe}`).bind(id,owner,id,owner,id),db.prepare('DELETE FROM attachments WHERE id=? AND owner=? AND included=0 AND NOT EXISTS(SELECT 1 FROM memory_uploads WHERE attachment_id=?) AND NOT EXISTS(SELECT 1 FROM memory_contribution_attachments WHERE attachment_id=?)').bind(id,owner,id,id)]);
 if(result[1].meta.changes)await bucket().delete(a.object_key);else throw new ApiError(409,'El adjunto está vinculado a una propuesta o al historial. Cancela primero la propuesta pendiente.');
}

export async function previewMemoryMedia(owner:string,id:string){
 uuid.parse(id);const a=await database().prepare('SELECT a.object_key,a.mime,a.size FROM attachments a JOIN memory_uploads u ON u.attachment_id=a.id AND u.owner=a.owner AND u.note_id=a.note_id JOIN notes n ON n.id=u.note_id AND n.owner=u.owner WHERE a.id=? AND a.owner=?').bind(id,owner).first<{object_key:string;mime:string;size:number}>();
 if(!a)return (await import('./data')).attachment(owner,id);const file=await bucket().get(a.object_key);if(!file)throw new ApiError(404,'El adjunto no está disponible.');return {file,mime:a.mime,size:a.size};
}
