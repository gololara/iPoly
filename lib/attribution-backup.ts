// Complete logical journal envelope. This validates authorized export input; it
// neither fetches live data nor claims a native D1/R2 snapshot.
import {attributionHash,canonicalAttribution,parseAttributionRow} from './attribution-contract';
import type {AttributionRow} from './attribution-contract';
export const attributionBackupColumns=['id','owner','note_id','debrief_id','previous_id','predecessor_key','content','content_hash','request_hash','state','created_at','applied_at','approved_by','cancelled_at','guard'];
export async function makeAttributionBackup(rows:Record<string,unknown>[]){
 const payload={format:'ipoly-attribution-logical-v1' as const,table:'memory_attribution_corrections' as const,completeTable:true as const,columns:attributionBackupColumns,rows:structuredClone(rows).sort((a,b)=>String(a.id).localeCompare(String(b.id))),rowCount:rows.length};
 const envelope={...payload,sha256:await attributionHash(payload)};await validateAttributionBackup(envelope);return envelope;
}
export async function validateAttributionBackup(input:unknown){
 if(!input||typeof input!=='object')throw Error('Invalid journal backup');const e=input as Awaited<ReturnType<typeof makeAttributionBackup>>;
 if(e.format!=='ipoly-attribution-logical-v1'||e.table!=='memory_attribution_corrections'||e.completeTable!==true||!Array.isArray(e.rows)||e.rowCount!==e.rows.length||canonicalAttribution(e.columns)!==canonicalAttribution(attributionBackupColumns))throw Error('Incomplete journal backup');
 const {sha256,...payload}=e;if(await attributionHash(payload)!==sha256)throw Error('Journal backup digest mismatch');
 const records=new Map<string,AttributionRow>(),appliedChildren=new Map<string,string>();
 for(const raw of e.rows){
  if(!raw||canonicalAttribution(Object.keys(raw).sort())!==canonicalAttribution([...attributionBackupColumns].sort()))throw Error('Missing journal columns');const r=raw as unknown as AttributionRow;
  if(records.has(r.id)||!['proposed','applied','cancelled'].includes(r.state)||raw.guard!==1||raw.predecessor_key!==(r.previous_id??''))throw Error('Invalid journal row');
  if(r.state==='applied'?r.cancelled_at!==null:r.applied_at!==null||r.approved_by!==null||((r.state==='cancelled')!==(r.cancelled_at!==null)))throw Error('Invalid journal decision');
  const c=await parseAttributionRow(r);if(await attributionHash({id:r.id,noteId:r.note_id,debriefId:r.debrief_id,expectedNoteVersion:c.expectedNoteVersion,previousCorrectionId:c.previousCorrectionId,author:c.author,evidence:c.evidence})!==r.request_hash)throw Error('Journal request digest mismatch');
  records.set(r.id,r);if(r.state==='applied'){const key=canonicalAttribution([r.owner,r.note_id,r.debrief_id,r.previous_id]);if(appliedChildren.has(key))throw Error('Branched journal');appliedChildren.set(key,r.id);}
 }
 for(const r of records.values()){
  const seen=new Set<string>([r.id]);let p=r.previous_id;
  while(p){const previous=records.get(p);if(!previous||seen.has(p)||previous.state!=='applied'||previous.owner!==r.owner||previous.note_id!==r.note_id||previous.debrief_id!==r.debrief_id)throw Error('Broken journal predecessor');seen.add(p);p=previous.previous_id;}
 }
 return {table:e.table,rowCount:e.rowCount,sha256:e.sha256,completeTable:true};
}
