export type ClassPosition={active:string;opened:boolean;returnPosition:number};
export function rememberClassPosition(storage:Pick<Storage,'setItem'>,classId:string,position:ClassPosition){
 storage.setItem('ipoly.class-position.'+classId,JSON.stringify(position));
}
export function classNoteLabel(note:{snapshot:{title:string;original:string;clarified:string}},index:number){
 const description=note.snapshot.title.trim()||note.snapshot.original.trim()||note.snapshot.clarified.trim()||'Nota con adjuntos';
 return `${index+1}. ${description.replace(/\s+/g,' ').slice(0,90)}`;
}
