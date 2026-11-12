import {database} from './data';
export type TutorThread={id:string;currentPreparationId:string;version:number};
export async function threadFor(owner:string,id:string){return database().prepare('SELECT t.id,t.current_preparation_id AS currentPreparationId,t.version FROM tutor_thread_members m JOIN tutor_threads t ON t.id=m.thread_id AND t.owner=m.owner WHERE m.preparation_id=? AND m.owner=?').bind(id,owner).first<TutorThread>();}
