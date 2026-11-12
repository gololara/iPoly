import {attributionHash,parseAttributionRow} from './attribution-contract';
import type {AttributionRow} from './attribution-contract';
import type {MemoryEntry} from './memory-model';
export async function projectAttributions(entries:MemoryEntry[],rows:AttributionRow[],sources:{id:string;created_at:string;applied_at:string|null;clarified:string;expected_version:number}[],noteId:string,owner:string){
 const groups=new Map<string,AttributionRow[]>();
 for(const r of rows){if(r.owner!==owner||r.note_id!==noteId||r.state!=='applied'||r.approved_by!==owner)throw Error('Invalid attribution scope');const group=groups.get(r.debrief_id)??[];group.push(r);groups.set(r.debrief_id,group);}
 for(const [debriefId,group]of groups){
  const d=sources.find(d=>d.id===debriefId),matches=entries.filter(e=>e.source.debriefId===debriefId);if(!d||!d.applied_at||matches.length!==1)throw Error('Invalid attribution source');
  const e=matches[0],expectedHash=await attributionHash({noteId,debriefId,noteVersion:d.expected_version+1,text:d.clarified,debriefCreatedAt:d.created_at,debriefAppliedAt:d.applied_at});
  const chain=new Map(group.map(r=>[r.previous_id,r]));if(chain.size!==group.length)throw Error('Ambiguous attribution chain');let current:string|null=null;
  const history:NonNullable<MemoryEntry['attribution']>['history']=[];
  while(chain.has(current)){const r:AttributionRow=chain.get(current)!;chain.delete(current);const c=await parseAttributionRow(r);if(c.sourceContentHash!==expectedHash||e.text!==c.source.text||e.source.noteVersion!==c.source.noteVersion)throw Error('Changed attribution source');history.push({id:r.id,author:c.author,proposedBy:{role:'user',id:r.owner,name:null},confirmedBy:{role:'user',id:r.approved_by,name:null},proposedAt:r.created_at,confirmedAt:r.applied_at!,evidence:c.evidence,sourceContentHash:c.sourceContentHash});current=r.id;}
  if(chain.size||!history.length)throw Error('Broken attribution chain');
  e.attribution={originalAuthor:e.author,currentId:current!,history};e.author=history.at(-1)!.author;
 }
}
