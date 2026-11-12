// Identifiers are internal SQL expressions, never user-supplied strings.
export function ownedMemoryClassSql(classId:string,owner:string){return `(EXISTS(SELECT 1 FROM tutor_threads t WHERE t.id=${classId} AND t.owner=${owner}) OR EXISTS(SELECT 1 FROM tutor_records p WHERE p.id=${classId} AND p.owner=${owner} AND p.kind='preparation' AND p.state='applied') OR EXISTS(SELECT 1 FROM memory_classes mc WHERE mc.id=${classId} AND mc.owner=${owner}))`;}
export function foldMemoryTextSql(expression:string){let sql=expression;for(const [upper,lower]of [['Ë','ë'],['Ç','ç'],['Á','á'],['É','é'],['Í','í'],['Ó','ó'],['Ú','ú'],['Ü','ü'],['Ñ','ñ']])sql=`replace(${sql},'${upper}','${lower}')`;return `lower(${sql})`;}
// Every row belongs to one scoped memory. Never search global class summaries,
// proposal bodies, before snapshots, credentials or another memory's changes.
export const memoryListSourcesSql=`
 SELECT n.id note_id,CAST(part.value AS text) text,0 debrief,0 class_work,NULL role,NULL happened_at
 FROM base n,json_each(json_array(n.original,n.clarified,n.title)) part
 UNION ALL
 SELECT n.id,t.name,0,0,NULL,NULL FROM base n JOIN note_tags nt ON nt.note_id=n.id JOIN tags t ON t.id=nt.tag_id AND t.owner=n.owner
 UNION ALL
 SELECT n.id,COALESCE(json_extract(r.content,'$.after.clarified'),'')||' '||COALESCE(json_extract(r.content,'$.after.title'),''),0,0,NULL,r.created_at
 FROM base n JOIN revisions r ON r.note_id=n.id AND r.owner=n.owner
 WHERE json_valid(r.content) AND json_extract(r.content,'$.after.noteId')=n.id AND json_type(r.content,'$.after.clarified')='text'
 UNION ALL
 SELECT n.id,COALESCE(json_extract(change.value,'$.clarified'),'')||' '||COALESCE(json_extract(change.value,'$.title'),''),1,0,NULL,COALESCE(d.applied_at,d.created_at)
 FROM base n JOIN debriefs d ON d.owner=n.owner AND d.state='applied',json_each(d.changes) change WHERE json_extract(change.value,'$.noteId')=n.id
 UNION ALL
 SELECT n.id,COALESCE(json_extract(change.value,'$.clarified'),'')||' '||COALESCE(json_extract(change.value,'$.title'),''),0,1,NULL,COALESCE(t.applied_at,t.created_at)
 FROM base n JOIN tutor_records t ON t.owner=n.owner AND t.kind='closing' AND t.state='applied',json_each(t.data,'$.changes') change WHERE json_extract(change.value,'$.noteId')=n.id
 UNION ALL
 SELECT n.id,COALESCE(json_extract(e.value,'$.text'),'')||' '||COALESCE(json_extract(e.value,'$.examples'),'')||' '||COALESCE(json_extract(e.value,'$.questions'),'')||' '||COALESCE(json_extract(e.value,'$.attribution'),''),0,1,NULL,json_extract(e.value,'$.createdAt')
 FROM base n JOIN class_sessions s ON s.owner=n.owner,json_each(s.data,'$.notes."'||n.id||'".entries') e
 WHERE ${ownedMemoryClassSql('s.class_id','n.owner')} AND json_type(e.value,'$.id')='text' AND json_type(e.value,'$.text')='text' AND json_type(e.value,'$.createdAt')='text'
 UNION ALL
 SELECT n.id,'',0,1,NULL,(SELECT MAX(e.created_at) FROM class_session_events e WHERE e.owner=n.owner AND e.class_id=s.class_id) FROM base n JOIN class_sessions s ON s.owner=n.owner WHERE ${ownedMemoryClassSql('s.class_id','n.owner')} AND json_extract(s.data,'$.notes."'||n.id||'".status')='worked'
 UNION ALL
 SELECT n.id,c.text||' '||c.context||' '||COALESCE(c.author_name,'')||' '||COALESCE(c.recorder_name,''),CASE WHEN c.kind='debrief' THEN 1 ELSE 0 END,CASE WHEN ${ownedMemoryClassSql('c.class_id','n.owner')} THEN 1 ELSE 0 END,c.author_role,COALESCE(c.applied_at,c.created_at)
 FROM base n JOIN memory_contributions c ON c.note_id=n.id AND c.owner=n.owner AND c.state='applied' AND c.approved_by=n.owner
 UNION ALL
 SELECT n.id,COALESCE(json_extract(a.content,'$.author.name'),''),0,0,json_extract(a.content,'$.author.role'),a.applied_at
 FROM base n JOIN memory_attribution_corrections a ON a.note_id=n.id AND a.owner=n.owner AND a.state='applied' AND a.approved_by=n.owner
 JOIN debriefs d ON d.id=a.debrief_id AND d.owner=n.owner AND d.state='applied',json_each(d.changes) change
 WHERE json_extract(change.value,'$.noteId')=n.id AND json_extract(change.value,'$.clarified')=json_extract(a.content,'$.source.text') AND json_extract(change.value,'$.expectedVersion')+1=json_extract(a.content,'$.source.noteVersion') AND d.created_at=json_extract(a.content,'$.source.debriefCreatedAt') AND d.applied_at=json_extract(a.content,'$.source.debriefAppliedAt')
 AND NOT EXISTS(SELECT 1 FROM memory_attribution_corrections child WHERE child.previous_id=a.id AND child.owner=n.owner AND child.note_id=n.id AND child.debrief_id=a.debrief_id AND child.state='applied' AND child.approved_by=n.owner)
`;

// D1 rejects a flat compound SELECT with seven arms in this runtime. Small
// materialized groups preserve one read snapshot without that parser limit.
const sourceArms=memoryListSourcesSql.split('\n UNION ALL\n');
const groups=Array.from({length:Math.ceil(sourceArms.length/3)},(_,i)=>`memory_sources_${i} AS MATERIALIZED (${sourceArms.slice(i*3,i*3+3).join(' UNION ALL ')})`);
export const memoryListSourceCTEs=groups.join(',')+`,sources AS MATERIALIZED (${groups.map((_,i)=>`SELECT * FROM memory_sources_${i}`).join(' UNION ALL ')})`;
