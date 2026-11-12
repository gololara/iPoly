import {ApiError,database,getNote} from './data';
import {classTarget,getClassTeacher} from './class-teachers';
import {getPreparation} from './tutor';
import type {Note} from './model';
import {classNoteRemoved} from './class-membership';

export type ClassEntry={id:string;text:string;examples:string;questions:string;createdAt:string;classDate:string|null;author:string;recordedBy:string;teacherName:string|null;attribution:string;consultedVersion:number};
export type ClassWork={snapshot:Note;status:'pending'|'worked'|'confirm';entries:ClassEntry[];addedInClass:boolean;removedAt?:string};
type Session={notes:Record<string,ClassWork>;activeNoteId:string|null;closedAt?:string};
async function context(owner:string,id:string){
 const target=await classTarget(owner,id),p=await getPreparation(owner,id);
 if(p.preparation.state!=='applied'||target.thread&&target.thread.currentPreparationId!==id)throw new ApiError(409,'Abre la preparación aprobada y vigente para trabajar en clase.');
 const row=await database().prepare('SELECT version,data FROM class_sessions WHERE class_id=? AND owner=?').bind(target.classId,owner).first<{version:number;data:string}>();
 return {...target,...p,version:row?.version??0,data:row?JSON.parse(row.data) as Session:{notes:{},activeNoteId:null} as Session};
}
export async function readClassSession(owner:string,id:string){
 const c=await context(owner,id),a=await getClassTeacher(owner,id),ids=[...new Set([...c.preparation.data.references.map(r=>r.noteId),...Object.keys(c.data.notes)])].filter(id=>!classNoteRemoved(c.data.notes[id]));
 const notes=[];
 for(const noteId of ids){const current=await getNote(owner,noteId),work=c.data.notes[noteId];notes.push({noteId,currentVersion:current.version,...(work??{snapshot:current,status:'pending',entries:[],addedInClass:false})});}
 const integrated=(await database().prepare('SELECT entry_id,closing_id FROM class_session_integrations WHERE class_id=? AND owner=?').bind(c.classId,owner).all<{entry_id:string;closing_id:string}>()).results;
 const recentRequests=(await database().prepare('SELECT id FROM class_session_events WHERE class_id=? AND owner=? ORDER BY version DESC LIMIT 20').bind(c.classId,owner).all<{id:string}>()).results.map(r=>r.id);
 return {recentRequests,classId:c.classId,preparationId:id,version:c.version,teacherName:a.teacher?.name??null,notes,activeNoteId:c.data.activeNoteId,closedAt:c.data.closedAt??null,integrated};
}
