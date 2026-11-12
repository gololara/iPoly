import {appliedDebriefSql} from './review-sql';
import {classNoteRemovedSql,classSessionClosedSql} from './class-membership';
// Keep validation in the same UPDATE and D1 batch transaction as all revisions.
// A stale source or parent sets apply_guard=0; the schema CHECK aborts the batch.
// Every prepared call contains one statement, with no trigger-body splitting.
export const tutorApplySql = `
UPDATE tutor_records
SET apply_guard = CASE WHEN
 (
  kind='preparation' AND (NOT EXISTS(SELECT 1 FROM tutor_thread_members m WHERE m.preparation_id=tutor_records.id AND m.owner=tutor_records.owner) OR EXISTS(SELECT 1 FROM tutor_thread_members m JOIN tutor_threads t ON t.id=m.thread_id AND t.owner=m.owner WHERE m.preparation_id=tutor_records.id AND m.owner=tutor_records.owner AND t.current_preparation_id=tutor_records.id)) AND NOT EXISTS(
   SELECT 1 FROM json_each(tutor_records.data,'$.references') r
   WHERE NOT EXISTS(
    SELECT 1 FROM notes n WHERE n.owner=tutor_records.owner
    AND n.id=json_extract(r.value,'$.noteId')
    AND n.version=json_extract(r.value,'$.expectedVersion')
    AND ${appliedDebriefSql('n.id','n.owner',"json_extract(r.value,'$.expectedVersion')")}
   )
  )
 ) OR (
  kind='closing' AND EXISTS(
   SELECT 1 FROM tutor_records p
   WHERE p.id=tutor_records.parent_id AND p.owner=tutor_records.owner
   AND p.kind='preparation' AND p.state='applied'
   AND p.version=json_extract(tutor_records.data,'$.expectedPreparationVersion')
  ) AND NOT EXISTS(
   SELECT 1 FROM json_each(tutor_records.data,'$.changes') c
   WHERE NOT EXISTS(
    SELECT 1 FROM notes n WHERE n.owner=tutor_records.owner
    AND n.id=json_extract(c.value,'$.noteId')
    AND n.version=json_extract(c.value,'$.expectedVersion')
   )
  )
  AND NOT EXISTS(
   SELECT 1 FROM json_each(tutor_records.data,'$.changes') c JOIN class_sessions s ON s.owner=tutor_records.owner
   WHERE (s.class_id=tutor_records.parent_id OR EXISTS(SELECT 1 FROM tutor_thread_members m WHERE m.preparation_id=tutor_records.parent_id AND m.owner=tutor_records.owner AND m.thread_id=s.class_id))
   AND (${classNoteRemovedSql('s',"json_extract(c.value,'$.noteId')")} OR ${classSessionClosedSql('s')})
  )
 )
 THEN 1 ELSE 0 END,
 state='applied',version=version+1,applied_at=?
WHERE id=? AND owner=? AND state='proposed' AND version=?
`;
