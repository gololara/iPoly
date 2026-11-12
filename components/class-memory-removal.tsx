'use client';
import {useUiText} from './ui-locale';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import type {readSimpleClass} from '@/lib/simple-classes';

type Class=Awaited<ReturnType<typeof readSimpleClass>>;
type Command={classId:string;expectedVersion:number;requestId:string;noteId:string;expectedNoteVersion:number;confirmed:true};
export function ClassMemoryRemoval({viewerId,current,note,disabled,onBusy,onRemoved,onRefresh}:{viewerId:string;current:Class;note:Class['memories'][number];disabled:boolean;onBusy:(busy:boolean)=>void;onRemoved:(next:Class)=>void;onRefresh:()=>Promise<void>}){
 const {t:tr}=useUiText();
 const [open,setOpen]=useState(false),[command,setCommand]=useState<Command|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const key='ipoly-class-removal.'+viewerId+'.'+current.id+'.'+note.noteId;
 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(key)||'null') as Command|null;
   if(saved?.classId===current.id&&saved.noteId===note.noteId&&saved.confirmed===true&&Number.isSafeInteger(saved.expectedVersion)&&saved.expectedVersion>=0&&Number.isSafeInteger(saved.expectedNoteVersion)&&saved.expectedNoteVersion>0&&typeof saved.requestId==='string'){
    setCommand(saved);setPending(true);setOpen(true);
   }
  }catch{}
 },[key]);
 function begin(){
  if(!pending)setCommand({classId:current.id,expectedVersion:current.version,requestId:crypto.randomUUID(),noteId:note.noteId,expectedNoteVersion:note.noteVersion,confirmed:true});
  setError('');setOpen(true);
 }
 async function remove(){
  if(!command||busy||disabled||!pending&&note.removalBlockedReason)return;
  setBusy(true);onBusy(true);setError('');
  try{
   // Persist the exact approved command before sending. A lost response or a
   // refreshed parent must not rebase the versions or generate a new request.
   localStorage.setItem(key,JSON.stringify(command));setPending(true);
   const response=await fetch('/api/class-memory-removal',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
   const next=await response.json() as Class&{error?:string};
   if(!response.ok)throw Error(next.error||tr("No pudimos comprobar la solicitud. Recupera el estado de la clase."));
   localStorage.removeItem(key);setPending(false);setOpen(false);setCommand(null);onRemoved(next);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}
 }
 async function recover(){
  setBusy(true);onBusy(true);
  try{await onRefresh();localStorage.removeItem(key);setPending(false);setCommand(null);setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}
 }
 const blocked=!pending&&note.removalBlockedReason;
 return <><Button className="simple-class-remove" variant="ghost" disabled={disabled} onClick={begin} aria-label={tr("Quitar de esta clase:")+' '+note.title}>{tr("Quitar de esta clase")}</Button>
  <Dialog open={open} onOpenChange={v=>!busy&&setOpen(v)}><DialogContent className="detail-dialog class-state-dialog">
   <DialogTitle>{tr("Quitar memoria de esta clase")}</DialogTitle>
   <DialogDescription>{tr("La memoria «")}{note.title}{tr("» seguirá en Memorias, con su original, adjuntos e historial. Podrás elegirla para otra clase. La preparación histórica se conserva como contexto.")}</DialogDescription>
   {blocked?<p role="alert">{tr(blocked)}</p>:<><p>{tr("Se quitará únicamente de la lista de esta clase.")}</p>{pending&&<p role="status">{tr("Hay una solicitud anterior por comprobar. Se enviará el mismo identificador y las mismas versiones.")}</p>}<Button disabled={busy||disabled||!command} onClick={()=>void remove()}>{busy?tr("Comprobando…"):pending?tr("Comprobar solicitud"):tr("Quitar de esta clase")}</Button></>}
   {error&&<><p role="alert">{tr(error)}</p><Button variant="secondary" disabled={busy} onClick={()=>void recover()}>{tr("Recuperar estado de la clase")}</Button></>}
   {pending&&<p className="memory-small">{tr("Cerrar no revierte una solicitud ya enviada. Puedes recuperar el estado de la clase.")}</p>}
   <Button variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>{blocked?tr("Volver a la clase"):pending?tr("Cerrar"):tr("Conservar en la clase")}</Button>
  </DialogContent></Dialog>
 </>;
}
