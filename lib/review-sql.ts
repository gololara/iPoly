// Eligibility comes from an owned, applied debrief, never from worked or tags.
export function appliedDebriefSql(noteId:string,owner:string,maxVersion?:string){
 return `EXISTS(SELECT 1 FROM debriefs d, json_each(d.changes) change WHERE d.owner=${owner} AND d.state='applied' AND json_extract(change.value,'$.noteId')=${noteId}${maxVersion?` AND json_extract(change.value,'$.expectedVersion')+1<=${maxVersion}`:''})`;
}
