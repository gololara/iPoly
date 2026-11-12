import {deliveryOrigin,queueRevocation,deliverRevocation,status} from './teacher-delivery';
import {z} from 'zod';
import {ApiError,database} from './data';
import {classTarget} from './class-teachers';
const secret=z.string().regex(/^[a-f0-9]{64}$/);
export async function listPublications(owner:string,id:string){const {classId}=await classTarget(owner,id),origin=deliveryOrigin();const rows=(await database().prepare('SELECT id,teacher_id,published_at,expires_at,revoked_at,delivery_status FROM teacher_publications WHERE class_id=? AND owner=? ORDER BY published_at DESC LIMIT 30').bind(classId,owner).all<{id:string;delivery_status:string}>()).results;return {publications:rows.map(r=>({...r,expired:r.delivery_status==='published'&&Number((r as any).expires_at)<=Date.now(),url:r.delivery_status==='published'&&Number((r as any).expires_at)>Date.now()&&origin?origin+'/?copy='+r.id:null}))};}
export async function revokePublication(owner:string,input:unknown){const v=z.object({id:secret,confirmed:z.literal(true)}).strict().parse(input),db=database();const previous=await status(owner,v.id);if(previous.status==='revoked')return previous;await db.batch([db.prepare("UPDATE teacher_publications SET delivery_status=CASE WHEN delivery_status='revoked' THEN 'revoked' ELSE 'revocation_pending' END WHERE id=? AND owner=?").bind(v.id,owner),queueRevocation(owner,v.id)]);return deliverRevocation(owner,v.id);}
export async function accessMaterial(){throw new ApiError(404,'El material del maestro se consulta en su página separada.');}
