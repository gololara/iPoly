import type {MemoryContent,MemoryActorReview} from './memory-contract';
// Rechecked inside the same transaction that changes proposal/head/contribution.
// All values are bindings; neither role nor user content becomes SQL syntax.
// Internal SQL expressions only; user values always use the bound wrapper below.
// A contiguous counter alone is insufficient after a partial recovery: every
// writer receipt must still describe its exact applied row and media links.
// Current file/profile access is deliberately not checked here: revoking access
// must not destroy the historical receipt or grant that access again.
export function memoryLedgerSql(ownerSql:string,noteSql:string){
 const contributionFields:Record<string,string>={kind:'kind',text:'text',context:'context',author_role:'author.role',author_id:'author.id',author_name:'author.name',recorder_role:'recordedBy.role',recorded_by:'recordedBy.id',recorder_name:'recordedBy.name',class_id:'classId'};
 const mediaFields:Record<string,string>={speaker_role:'speaker.role',speaker_id:'speaker.id',speaker_name:'speaker.name',recorder_role:'recordedBy.role',recorded_by:'recordedBy.id',recorder_name:'recordedBy.name',consent_at:'recordingPermission.obtainedAt'};
 const changedContribution=`(${Object.keys(contributionFields).map(column=>'c.'+column).join(',')}) IS NOT (${Object.values(contributionFields).map(path=>"json_extract(p.content,'$."+path+"')").join(',')})`;
 const exactMedia=`(${Object.keys(mediaFields).map(column=>'m.'+column).join(',')}) IS (${Object.values(mediaFields).map(path=>"json_extract(a.value,'$."+path+"')").join(',')})`;
 return `EXISTS(WITH approval_scope(owner,note_id) AS (SELECT ${ownerSql},${noteSql})
 SELECT 1 FROM approval_scope s WHERE
 NOT EXISTS(SELECT 1 FROM memory_heads h WHERE h.note_id=s.note_id AND h.owner<>s.owner)
 AND EXISTS(SELECT 1 FROM (SELECT COUNT(*) total,COUNT(DISTINCT expected_memory_version) revisions,COALESCE(MAX(expected_memory_version)+1,0) highest FROM memory_proposals p WHERE p.owner=s.owner AND p.note_id=s.note_id AND p.state='applied' AND p.approved_by=s.owner) v
  WHERE v.total=v.revisions AND v.highest=v.total AND v.total=COALESCE((SELECT version FROM memory_heads WHERE note_id=s.note_id AND owner=s.owner),0))
 AND NOT EXISTS(SELECT 1 FROM memory_proposals p LEFT JOIN memory_contributions c ON c.id=p.id
  WHERE p.owner=s.owner AND p.note_id=s.note_id AND p.state='applied' AND (
   p.approved_by IS NOT s.owner OR CASE WHEN json_valid(p.content) THEN
    c.id IS NULL OR c.owner IS NOT p.owner OR c.note_id IS NOT p.note_id OR c.state IS NOT 'applied' OR c.approved_by IS NOT p.owner
    OR c.created_at IS NOT p.created_at OR c.applied_at IS NOT p.applied_at OR p.version<>1
    OR p.note_id IS NOT json_extract(p.content,'$.noteId')
    OR p.expected_note_version IS NOT json_extract(p.content,'$.expectedNoteVersion')
    OR p.expected_memory_version IS NOT json_extract(p.content,'$.expectedMemoryVersion')
    OR ${changedContribution}
    OR json_type(p.content,'$.attachments') IS NOT 'array'
    OR (SELECT COUNT(*) FROM memory_contribution_attachments m WHERE m.contribution_id=p.id)<>json_array_length(p.content,'$.attachments')
    OR EXISTS(SELECT 1 FROM json_each(p.content,'$.attachments') a WHERE NOT EXISTS(
     SELECT 1 FROM memory_contribution_attachments m WHERE m.contribution_id=p.id AND m.attachment_id=json_extract(a.value,'$.attachmentId') AND ${exactMedia}))
   ELSE 1 END))
 AND NOT EXISTS(SELECT 1 FROM memory_contributions c JOIN memory_proposals p ON p.id=c.id
  WHERE c.owner=s.owner AND c.note_id=s.note_id AND c.state='applied' AND (
   p.owner IS NOT c.owner OR p.note_id IS NOT c.note_id OR p.state IS NOT 'applied' OR p.approved_by IS NOT c.owner)))`;
}
// Phase-one entries without proposal records remain compatible and are not
// writer revisions. This wrapper keeps scope values parameterized everywhere.
export function memoryLedger(owner:string,noteId:string){return {sql:memoryLedgerSql('?','?'),args:[owner,noteId]};}
export function memoryGuard(owner:string,c:MemoryContent){
 const actors:MemoryActorReview[]=[c.author,...(c.recordedBy?[c.recordedBy]:[]),...c.attachments.flatMap(m=>[...(m.speaker?[m.speaker]:[]),...(m.recordedBy?[m.recordedBy]:[])])];
 const media=c.attachments.map(a=>a.media);
 const ledger=memoryLedger(owner,c.noteId);
 const sql=`${ledger.sql} AND EXISTS(SELECT 1 FROM notes n WHERE n.id=? AND n.owner=? AND n.version=?)
 AND COALESCE((SELECT version FROM memory_heads WHERE note_id=? AND owner=?),0)=?
 AND NOT EXISTS(SELECT 1 FROM memory_heads WHERE note_id=? AND owner<>?)
 AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE (json_extract(r.value,'$.role')='user' AND (json_extract(r.value,'$.id') IS NOT ? OR json_extract(r.value,'$.profileVersion') IS NOT NULL)) OR (json_extract(r.value,'$.role') IN ('ai','unknown') AND (json_extract(r.value,'$.id') IS NOT NULL OR json_extract(r.value,'$.profileVersion') IS NOT NULL)) OR (json_extract(r.value,'$.role')='tutor' AND NOT EXISTS(SELECT 1 FROM teachers t WHERE t.id=json_extract(r.value,'$.id') AND t.owner=? AND t.name=json_extract(r.value,'$.name') AND t.version=json_extract(r.value,'$.profileVersion') AND t.language_id=(SELECT language FROM notes WHERE id=? AND owner=?))))
 AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM attachments a JOIN notes n ON n.id=a.note_id WHERE a.id=json_extract(r.value,'$.id') AND a.owner=? AND n.owner=? AND a.note_id=? AND (a.included=1 OR EXISTS(SELECT 1 FROM memory_uploads u WHERE u.attachment_id=a.id AND u.owner=a.owner AND u.note_id=a.note_id)) AND a.mime=json_extract(r.value,'$.mime') AND a.origin=json_extract(r.value,'$.origin') AND a.size=json_extract(r.value,'$.size') AND a.created_at=json_extract(r.value,'$.createdAt') AND a.duration_ms IS json_extract(r.value,'$.durationMs') AND a.content_hash IS json_extract(r.value,'$.contentHash')))`;
 const args=[...ledger.args,c.noteId,owner,c.expectedNoteVersion,c.noteId,owner,c.expectedMemoryVersion,c.noteId,owner,JSON.stringify(actors),owner,owner,c.noteId,owner,JSON.stringify(media),owner,owner,c.noteId];
 return {sql,args};
}
