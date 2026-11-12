import {z} from 'zod';
import {uuid} from './data';
export const memoryActorInput=z.object({role:z.enum(['user','ai','tutor','unknown']),id:z.string().min(1).max(200).nullable().default(null),name:z.string().min(1).max(200).nullable().default(null)}).strict();
export const memoryActorReview=memoryActorInput.extend({id:z.string().min(1).max(200).nullable(),name:z.string().min(1).max(200).nullable(),profileVersion:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()}).strict();
const permission=z.object({confirmed:z.literal(true),obtainedAt:z.string().datetime({offset:true})}).strict();
const mediaInput=z.object({attachmentId:uuid,speaker:memoryActorInput.nullable().default(null),recordedBy:memoryActorInput.nullable().default(null),recordingPermission:permission.nullable().default(null)}).strict();
const mediaSnapshot=z.object({id:uuid,mime:z.string(),origin:z.string().min(1).max(80),size:z.number().int().nonnegative(),durationMs:z.number().int().nullable(),createdAt:z.string().datetime({offset:true}),contentHash:z.string().nullable()}).strict();
const fields={noteId:uuid,expectedNoteVersion:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),expectedMemoryVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),kind:z.enum(['addition','debrief','correction','exercise']),text:z.string().max(30000),context:z.string().max(6000).default(''),author:memoryActorInput,recordedBy:memoryActorInput.nullable().default(null),attachments:z.array(mediaInput).max(5).default([])};
// Older class-free requests may still carry a null association. New requests omit it.
export const proposeMemorySchema=z.object({id:uuid,...fields,classId:z.null().optional()}).strict();
export const memoryContentSchema=z.object({...fields,context:z.string().max(6000),classId:uuid.nullable().optional(),author:memoryActorReview,recordedBy:memoryActorReview.nullable(),attachments:z.array(mediaInput.extend({speaker:memoryActorReview.nullable(),recordedBy:memoryActorReview.nullable(),recordingPermission:permission.nullable(),media:mediaSnapshot}).strict()).max(5)}).strict();
export const memoryDecisionSchema=z.object({id:uuid,proposalVersion:z.literal(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict();
export const applyMemorySchema=memoryDecisionSchema.extend({approvedContent:memoryContentSchema}).strict();
export type MemoryContent=z.infer<typeof memoryContentSchema>;
export type MemoryActorReview=z.infer<typeof memoryActorReview>;
export type MemoryProposal={id:string;proposalVersion:1;contentHash:string;state:'proposed'|'applied'|'cancelled';content:MemoryContent;createdAt:string;appliedAt:string|null;cancelledAt:string|null};
// Local deterministic JSON representation; arrays/text retain their exact order/content.
export function canonical(value:unknown):string{
 const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,sorted(x)])):v;
 return JSON.stringify(sorted(value));
}
