'use client';
import {useUiText} from './ui-locale';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import type {readSimpleClass} from '@/lib/simple-classes';
type Class=Awaited<ReturnType<typeof readSimpleClass>>;
type Command={classId:string;expectedVersion:number;requestId:string;closed:boolean;confirmed:true};
type Review={title:string;total:number;worked:number};
export function ClassSessionClosure({viewerId,current,disabled,onBusy,onChanged,onRefresh}:{viewerId:string;current:Class;disabled:boolean;onBusy:(busy:boolean)=>void;onChanged:(next:Class)=>void;onRefresh:()=>Promise<void>}){
 const {t:tr}=useUiText();
 const [open,setOpen]=useState(false),[command,setCommand]=useState<Command|null>(null),[review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const key='ipoly-class-session-state.'+viewerId+'.'+current.id;
 useEffect(()=>{
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.command?.classId===current.id&&saved.command.confirmed===true&&typeof saved.command.closed==='boolean'&&Number.isSafeInteger(saved.command.expectedVersion)&&saved.command.expectedVersion>=0&&typeof saved.command.requestId==='string'&&typeof saved.review?.title==='string'&&Number.isSafeInteger(saved.review.total)&&Number.isSafeInteger(saved.review.worked)){setCommand(saved.command);setReview(saved.review);setPending(true);setOpen(true);}}catch{}
 },[key]);
 function begin(){if(!pending){setCommand({classId:current.id,expectedVersion:current.version,requestId:crypto.randomUUID(),closed:!current.closedAt,confirmed:true});setReview({title:current.title,total:current.memories.length,worked:current.memories.filter(n=>n.reviewed).length});}setError('');setOpen(true);}
 async function save(){
  if(!command||!review||busy||disabled)return;setBusy(true);onBusy(true);setError('');
  try{
   localStorage.setItem(key,JSON.stringify({command,review}));setPending(true);
   const r=await fetch('/api/class-session-state',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}),d=await r.json() as Class&{error?:string};
   if(!r.ok)throw Error(d.error||tr("No pudimos comprobar el estado de la clase."));
   localStorage.removeItem(key);setPending(false);setOpen(false);onChanged(d);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}
 }
 async function recover(){setBusy(true);onBusy(true);try{await onRefresh();localStorage.removeItem(key);setPending(false);setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}}
 const closing=command?.closed??!current.closedAt,remaining=review?review.total-review.worked:0;
 return <><Button variant={current.closedAt?'secondary':'default'} disabled={disabled} onClick={begin}>{current.closedAt?tr("Reabrir clase"):tr("Cerrar clase")}</Button>
  <Dialog open={open} onOpenChange={v=>!busy&&setOpen(v)}><DialogContent className="detail-dialog class-state-dialog">
   <DialogTitle>{closing?tr("Cerrar clase"):tr("Reabrir clase")}</DialogTitle>
   <DialogDescription>{closing?tr("Registrar el fin de esta sesión conserva sus memorias, aportes, preparación e historial. No significa dominar el contenido."):tr("Podrás ajustar la lista y registrar más trabajo en esta misma clase. El cierre anterior queda en su historial.")}</DialogDescription>
   {review&&<p><strong>{review.title}</strong> · {review.worked} de {review.total}{' '+tr("memorias marcadas como trabajadas.")}</p>}
   {closing&&(remaining>0?<p role="status">{tr("Memorias pendientes:")+' '}{remaining}{tr(". Puedes volver y quitar las que no vieron, o cerrar manteniéndolas pendientes. Seguirán disponibles para otra clase; no se marcarán como vistas.")}</p>:review?.total===0?<p>{tr("Esta clase no tiene memorias seleccionadas. Puedes registrar que la sesión terminó.")}</p>:<p>{tr("Revisaste las memorias seleccionadas. El cierre se registra solo al confirmar.")}</p>)}
   {closing&&<p>{tr("Para cambiar después las memorias de esta clase o añadirle aportes, podrás reabrirla.")}</p>}
   {pending&&<p role="status">{tr("Se comprobará la solicitud anterior con el mismo identificador y versión. Cerrar este diálogo no revierte una solicitud ya enviada.")}</p>}
   {error&&<><p role="alert">{tr(error)}</p><Button variant="secondary" disabled={busy} onClick={()=>void recover()}>{tr("Recuperar estado de la clase")}</Button></>}
   <Button disabled={busy||disabled||!command} onClick={()=>void save()}>{busy?tr("Comprobando…"):pending?tr("Comprobar solicitud"):closing?tr("Confirmar cierre"):tr("Confirmar reapertura")}</Button>
   <Button variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>{pending?tr("Cerrar diálogo"):tr("Volver a revisar")}</Button>
  </DialogContent></Dialog>
 </>;
}
