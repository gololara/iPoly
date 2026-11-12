'use client';
import {useUiText} from './ui-locale';

import {useEffect,useState} from 'react';
import {Button} from './ui/button';

type Access={id:string;kind:'link'|'copy';name:string|null;status:string;expiry:number|null};
export function LegacyTeacherAccess(){
 const {t:tr}=useUiText();
 const [access,setAccess]=useState<Access[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [confirm,setConfirm]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(signal?:AbortSignal){
  setLoading(true);setError('');
  try{
   const r=await fetch('/api/legacy-teacher-access',{cache:'no-store',signal});
   const d=await r.json() as {access:Access[];error?:string};
   if(!r.ok)throw Error(d.error??tr("No pudimos consultar los accesos anteriores."));
   setAccess(d.access);
  }catch(e){if(!signal?.aborted)setError((e as Error).message);}
  finally{if(!signal?.aborted)setLoading(false);}
 }
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[]);
 async function revoke(row:Access){
  setBusy(true);setError('');setMessage('');
  try{
   const r=await fetch('/api/'+(row.kind==='link'?'teacher-sharing-disable':'material-revoke'),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(row.kind==='link'?{linkId:row.id,confirmed:true}:{id:row.id,confirmed:true}),
   });
   const d=await r.json() as {link?:{status:string};status?:string;error?:string};
   if(!r.ok)throw Error(d.error??tr("No pudimos retirar el acceso."));
   const status=d.link?.status??d.status;
   setMessage(status==='disabled'||status==='revoked'?tr("Acceso retirado."):tr("Retirada pendiente de confirmación. Puedes reintentar desde aquí."));
   setConfirm(null);await load();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 if(!loading&&!error&&!access.length&&!message)return null;
 return <details className="memory-historical">
  <summary>{tr("Accesos anteriores de maestros")}</summary>
  <p className="memory-small">{tr("Desde aquí solo puedes consultar y retirar accesos ya emitidos.")}</p>
  {loading&&<p role="status">{tr("Consultando accesos…")}</p>}
  {message&&<p role="status">{tr(message)}</p>}
  {error&&<p role="alert">{tr(error)} <Button type="button" variant="ghost" disabled={busy} onClick={()=>void load()}>{tr("Volver a consultar")}</Button></p>}
  {access.map(row=><div key={row.kind+row.id}>
   <p>{row.name??tr("Maestro")} · {row.kind==='link'?tr("Enlace"):tr("Copia")} · {row.status.endsWith('_pending')?tr("Retirada pendiente"):row.expiry&&row.expiry<=Date.now()?tr("Copia caducada"):tr("Acceso anterior")}</p>
   {confirm===row.id?<><p>{tr("¿Quieres retirar este acceso del maestro?")}</p><Button type="button" disabled={busy} onClick={()=>void revoke(row)}>{tr("Confirmar retirada")}</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>setConfirm(null)}>{tr("Cancelar")}</Button></>:<Button type="button" variant="secondary" disabled={busy} onClick={()=>setConfirm(row.id)}>{row.status.endsWith('_pending')?tr("Reintentar retirada"):tr("Retirar acceso")}</Button>}
  </div>)}
 </details>;
}
