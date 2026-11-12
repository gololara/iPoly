import {database} from './data';
import {classTarget} from './class-teachers';
import type {ClassDetails} from './class-detail-model';
export async function getClassDetails(owner:string,id:string):Promise<ClassDetails>{const {classId,thread}=await classTarget(owner,id);const r=await database().prepare('SELECT class_date,class_type,methodology,version FROM class_details WHERE class_id=? AND owner=?').bind(classId,owner).first<{class_date:string|null;class_type:ClassDetails['classType'];methodology:string;version:number}>();return {classId,version:r?.version??0,threadVersion:thread?.version??null,editable:!thread||thread.currentPreparationId===id,classDate:r?.class_date??null,classType:r?.class_type??null,methodology:r?.methodology??''};}
