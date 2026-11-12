import type {TutorRecord} from './tutor';
export function materialCandidates(p:TutorRecord){return [{id:'summary',label:'Resumen de la preparación',text:p.data.summary},...p.data.references.filter(r=>r.snapshot.clarified.trim()).map(r=>({id:r.noteId,label:'Aclaración · fuente v'+r.expectedVersion,text:r.snapshot.clarified}))];}
export function selectMaterial(p:TutorRecord,ids:string[]){if(p.state!=='applied')return [];const selected=new Set(ids);return materialCandidates(p).filter(c=>selected.has(c.id));}
