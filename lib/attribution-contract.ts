import {z} from 'zod';
const id=z.string().uuid(),version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),hash=z.string().regex(/^[a-f0-9]{64}$/),name=z.string().trim().min(1).max(120).nullable();
export const attributionAuthorSchema=z.object({role:z.enum(['ai','user','unknown']),id:z.string().min(1).max(250).nullable(),name}).strict();
export const attributionEvidenceSchema=z.object({kind:z.literal('user_attestation'),statement:z.string().trim().min(1).max(2000),reference:z.string().trim().min(1).max(500).nullable()}).strict();
export const attributionSourceSchema=z.object({noteId:id,debriefId:id,noteVersion:version,text:z.string().max(30000),debriefCreatedAt:z.string().datetime({offset:true}),debriefAppliedAt:z.string().datetime({offset:true})}).strict();
export const attributionContentSchema=z.object({source:attributionSourceSchema,sourceContentHash:hash,expectedNoteVersion:version,previousCorrectionId:id.nullable(),author:attributionAuthorSchema,evidence:attributionEvidenceSchema}).strict();
export const proposeAttributionSchema=z.object({id,noteId:id,debriefId:id,expectedNoteVersion:version,previousCorrectionId:id.nullable(),author:attributionAuthorSchema,evidence:attributionEvidenceSchema}).strict();
export const attributionDecisionSchema=z.object({id,proposalVersion:z.literal(1),contentHash:hash,confirmed:z.literal(true)}).strict();
export const applyAttributionSchema=attributionDecisionSchema.extend({approvedContent:attributionContentSchema}).strict();
export type AttributionContent=z.infer<typeof attributionContentSchema>;
export type AttributionSource=z.infer<typeof attributionSourceSchema>;
export type AttributionRow={id:string;owner:string;note_id:string;debrief_id:string;previous_id:string|null;content:string;content_hash:string;request_hash:string;state:'proposed'|'applied'|'cancelled';created_at:string;applied_at:string|null;approved_by:string|null;cancelled_at:string|null};
export function canonicalAttribution(v:unknown):string{if(Array.isArray(v))return '['+v.map(canonicalAttribution).join(',')+']';if(v!==null&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalAttribution((v as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(v);}
export async function attributionHash(v:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalAttribution(v)))),b=>b.toString(16).padStart(2,'0')).join('');}
export const attributionProposalHash=(id:string,content:AttributionContent)=>attributionHash({id,proposalVersion:1,content});
export async function parseAttributionRow(r:AttributionRow){
 const c=attributionContentSchema.parse(JSON.parse(r.content));
 if(canonicalAttribution(c)!==r.content||c.source.noteId!==r.note_id||c.source.debriefId!==r.debrief_id||c.previousCorrectionId!==r.previous_id||await attributionHash(c.source)!==c.sourceContentHash||await attributionProposalHash(r.id,c)!==r.content_hash)throw Error('Invalid attribution journal');
 if(c.author.role==='user'?c.author.id!==r.owner:c.author.id!==null)throw Error('Invalid attribution actor');
 if(c.author.role==='unknown'&&c.author.name!==null)throw Error('Unknown attribution cannot claim a name');
 if(!Number.isFinite(Date.parse(r.created_at))||(r.state==='applied'&&(!r.applied_at||!Number.isFinite(Date.parse(r.applied_at))||r.approved_by!==r.owner)))throw Error('Invalid attribution approval');
 return c;
}
