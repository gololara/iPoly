import {z} from 'zod';
import {ApiError,database,digest} from './data';
import {deliveryConfig,deliveryOrigin} from './teacher-delivery';
import {getClassTeacher} from './class-teachers';
import {getClassDetails} from './class-details';

const token=z.string().regex(/^[a-f0-9]{64}$/);
type Link={id:string;owner:string;teacher_id:string;status:'active'|'disable_pending'|'disabled';version:number;remote_version:number;current_publication_id:string|null;pending_publication_id:string|null;created_at:number;disabled_at:number|null};
type Copy={id:string;link_id:string;class_id:string;status:string;published_at:number|null;expires_at:number|null;snapshot:string;request_hash:string;link_version:number};
const conflict=()=>new ApiError(409,'Cambió la clase o el enlace. Recupera el estado y revisa otra vez antes de confirmar.');
async function findLink(owner:string,id:string){const link=await database().prepare('SELECT * FROM teacher_links WHERE id=? AND owner=?').bind(id,owner).first<Link>();if(!link)throw new ApiError(404,'No encontramos ese enlace.');return link;}
async function latestLink(owner:string,teacherId:string){return database().prepare("SELECT * FROM teacher_links WHERE owner=? AND teacher_id=? ORDER BY CASE WHEN status='disabled' THEN 1 ELSE 0 END,created_at DESC,id DESC LIMIT 1").bind(owner,teacherId).first<Link>();}
async function view(owner:string,link:Link|null){
 if(!link)return null;
 const db=database(),copy=link.current_publication_id?await db.prepare('SELECT * FROM teacher_share_copies WHERE id=? AND owner=?').bind(link.current_publication_id,owner).first<Copy>():null;
 const origin=deliveryOrigin();
 return {id:link.id,status:link.status,version:link.version,remoteVersion:link.remote_version,url:link.status==='active'&&link.remote_version>0&&origin?origin+'/?teacher='+link.id:null,pending:link.version>link.remote_version&&link.status!=='disabled',currentCopy:copy?{id:copy.id,classId:copy.class_id,publishedAt:copy.published_at,expiresAt:copy.expires_at,expired:!!copy.expires_at&&copy.expires_at<=Date.now(),snapshot:JSON.parse(copy.snapshot)}:null};
}
export async function teacherSharingState(owner:string,preparationId:string){
 const a=await getClassTeacher(owner,preparationId),d=await getClassDetails(owner,preparationId);
 return {teacher:a.teacher,details:d,link:a.teacher?await view(owner,await latestLink(owner,a.teacher.id)):null};
}
export async function disableTeacherLink(owner:string,input:unknown){
 const v=z.object({linkId:token,confirmed:z.literal(true)}).strict().parse(input),link=await findLink(owner,v.linkId),db=database();
 if(link.status==='disabled')return {link:await view(owner,link)};
 if(link.status==='active'){
  const version=link.version+1,payload=JSON.stringify({domain:'ipoly-teacher-link-v1',action:'disable',linkId:link.id,version});
  try{await db.batch([
   db.prepare("UPDATE teacher_links SET status='disable_pending',version=?,pending_publication_id=NULL WHERE id=? AND owner=? AND version=? AND status='active'").bind(version,link.id,owner,link.version),
   db.prepare("INSERT INTO teacher_share_outbox(id,owner,link_id,version,action,payload,guard) VALUES(?,?,?,?,'disable',?,CASE WHEN EXISTS(SELECT 1 FROM teacher_links WHERE id=? AND owner=? AND status='disable_pending' AND version=?) THEN 1 ELSE 0 END) ON CONFLICT(id) DO NOTHING").bind(link.id+':disable:'+version,owner,link.id,version,payload,link.id,owner,version)
  ]);}catch(e){if(/CHECK|UNIQUE/.test(String(e)))throw conflict();throw e;}
 }
 return deliverTeacherShare(owner,link.id);
}
async function deliverTeacherShare(owner:string,linkId:string){
 const db=database(),link=await findLink(owner,linkId),cfg=deliveryConfig();
 if(link.status!=='disable_pending'||!cfg)return {link:await view(owner,link)};
 const action='disable';
 const row=await db.prepare("UPDATE teacher_share_outbox SET attempts=attempts+1 WHERE owner=? AND link_id=? AND version=? AND action=? AND state='pending' RETURNING id,payload,attempts").bind(owner,linkId,link.version,action).first<{id:string;payload:string;attempts:number}>();
 if(!row)return {link:await view(owner,link)};
 try{
  const command={...JSON.parse(row.payload),requestId:await digest(row.id+':'+row.attempts),issuedAt:Date.now()},body=JSON.stringify(command);
  const key=await crypto.subtle.importKey('jwk',JSON.parse(cfg.raw),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(body)))));
  const response=await fetch(cfg.origin+'/api/links/commands',{method:'POST',headers:{'Content-Type':'application/json','x-command-signature':signature},body,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('remote');const ack=await response.json() as any;
  if(ack.linkId!==linkId)throw Error('ack');
  if(ack.state!=='disabled')throw Error('ack');
   await db.batch([db.prepare("UPDATE teacher_links SET status='disabled',remote_version=MAX(version,remote_version),current_publication_id=NULL,pending_publication_id=NULL,disabled_at=COALESCE(disabled_at,?) WHERE id=? AND owner=?").bind(Date.now(),linkId,owner),db.prepare("UPDATE teacher_share_copies SET status='disabled' WHERE link_id=? AND owner=?").bind(linkId,owner),db.prepare("UPDATE teacher_share_outbox SET state='sent',last_error='' WHERE id=? AND owner=? AND action='disable'").bind(row.id,owner)]);
 }catch{await db.prepare("UPDATE teacher_share_outbox SET last_error='Confirmación pendiente; reintenta sin crear otra copia.' WHERE id=? AND owner=? AND state='pending'").bind(row.id,owner).run();}
 return {link:await view(owner,await findLink(owner,linkId))};
}

export async function listHistoricalTeacherAccess(owner:string){
 const db=database();
 const [links,copies]=await db.batch<{id:string;name:string|null;status:string;expiry:number|null}>([
  db.prepare(`SELECT l.id,t.name,l.status,c.expires_at AS expiry FROM teacher_links l
   LEFT JOIN teachers t ON t.id=l.teacher_id AND t.owner=l.owner
   LEFT JOIN teacher_share_copies c ON c.id=l.current_publication_id AND c.owner=l.owner
   WHERE l.owner=? AND l.status<>'disabled' ORDER BY l.created_at DESC`).bind(owner),
  db.prepare(`SELECT p.id,t.name,p.delivery_status AS status,p.expires_at AS expiry FROM teacher_publications p
   LEFT JOIN teachers t ON t.id=p.teacher_id AND t.owner=p.owner
   WHERE p.owner=? AND p.delivery_status<>'revoked' ORDER BY p.published_at DESC`).bind(owner)
 ]);
 return {access:[...links.results.map(r=>({...r,kind:'link'})),...copies.results.map(r=>({...r,kind:'copy'}))]};
}
