import type {ClassWork} from './class-session';

// Membership is separate from the immutable preparation and the memory itself.
// Keep the work/snapshot and append-only session events when membership changes.
export const classNoteRemoved=(work:ClassWork|undefined)=>work?.removedAt!==undefined;
// Internal SQL identifiers/expressions only. Note IDs and ownership stay bound.
export const classNoteRemovedSql=(session:string,note:string)=>`json_type(${session}.data,'$.notes."'||${note}||'".removedAt') IS NOT NULL`;
export const classSessionClosedSql=(session:string)=>`json_type(${session}.data,'$.closedAt') IS NOT NULL`;
export type ClassNoteEvidence={contributions:number;pending:number;closings:number;integrated:number};
export function classNoteEvidence(owner:string,classId:string,noteId:string){
 const sql=`SELECT
 EXISTS(SELECT 1 FROM memory_contributions WHERE owner=? AND class_id=? AND note_id=? AND state='applied') contributions,
 EXISTS(SELECT 1 FROM memory_proposals WHERE owner=? AND note_id=? AND state='proposed' AND json_extract(content,'$.classId')=?) pending,
 EXISTS(SELECT 1 FROM tutor_records c LEFT JOIN tutor_thread_members m ON m.preparation_id=c.parent_id AND m.owner=c.owner
  WHERE c.owner=? AND c.kind='closing' AND (c.parent_id=? OR m.thread_id=?)
  AND (EXISTS(SELECT 1 FROM json_each(c.data,'$.changes') x WHERE json_extract(x.value,'$.noteId')=?)
   OR EXISTS(SELECT 1 FROM json_each(c.data,'$.classContributions.entries') x WHERE json_extract(x.value,'$.noteId')=?))) closings,
 EXISTS(SELECT 1 FROM class_session_integrations WHERE owner=? AND class_id=? AND note_id=?) integrated`;
 return {sql,args:[owner,classId,noteId,owner,noteId,classId,owner,classId,classId,noteId,noteId,owner,classId,noteId]};
}
export function classRemovalReason(work:ClassWork|undefined,e:ClassNoteEvidence){
 if(work?.entries.length||e.contributions||e.closings||e.integrated)return 'Esta memoria tiene aportes o cambios de cierre vinculados a esta clase. Conservamos su asociación para mantener el contexto y el historial.';
 if(e.pending)return 'Hay una propuesta de aporte pendiente para esta memoria y clase. Revísala o cancélala desde la memoria antes de quitarla.';
 if(work?.status==='worked')return 'Está marcada como trabajada en esta clase. Si fue un error, desmarca esa casilla antes de quitarla.';
 if(work?.status==='confirm')return 'Esta memoria tiene una confirmación pendiente registrada en la clase. Conservamos su asociación y su historial.';
 return null;
}
