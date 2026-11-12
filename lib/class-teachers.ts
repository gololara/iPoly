import {ApiError,database,uuid} from './data';
import {threadFor} from './tutor-threads';
import {getTeacher} from './teachers';
export async function classTarget(owner:string,id:string){uuid.parse(id);const p=await database().prepare("SELECT id FROM tutor_records WHERE id=? AND owner=? AND kind='preparation'").bind(id,owner).first();if(!p)throw new ApiError(404,'No encontramos esa preparación.');const thread=await threadFor(owner,id);return {classId:thread?.id??id,thread};}
export async function getClassTeacher(owner:string,id:string){const {classId,thread}=await classTarget(owner,id);const row=await database().prepare('SELECT teacher_id,version FROM class_teachers WHERE class_id=? AND owner=?').bind(classId,owner).first<{teacher_id:string|null;version:number}>();return {classId,version:row?.version??0,threadVersion:thread?.version??null,editable:!thread||thread.currentPreparationId===id,teacher:row?.teacher_id?await getTeacher(owner,row.teacher_id):null};}
