'use client';
import {useUiText} from './ui-locale';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Card} from './ui/card';
import {memoryDetailHref,memoryTime} from '@/lib/memory-detail';
import type {Debrief} from '@/lib/model';

// Source records stay in their original tables. This view never reapplies them.
export function HistoricalDebriefs({initiallyOpen=false,onSaved}:{initiallyOpen?:boolean;onSaved?:()=>void}){
 const {t:tr,locale}=useUiText();
 const [open,setOpen]=useState(initiallyOpen),[records,setRecords]=useState<Debrief[]|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!open)return;let alive=true;setError('');void fetch('/api/debriefs',{credentials:'same-origin',cache:'no-store'}).then(async r=>{const d=await r.json() as {debriefs:Debrief[];error?:string};if(!r.ok)throw Error(d.error||tr("No pudimos recuperar el historial."));if(alive)setRecords(d.debriefs);}).catch(e=>alive&&setError(e.message));return()=>{alive=false;};},[open,attempt]);
 async function apply(d:Debrief){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/debriefs/apply',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.id,confirmed:true})});const result=await r.json() as {error?:string};if(!r.ok)throw Error(result.error||tr("La propuesta cambió. Recupérala antes de aprobar."));setAttempt(n=>n+1);onSaved?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="memory-historical" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{tr("Historial de debriefings anteriores")}</summary><p className="memory-small">{tr("Se conservan sus propuestas y resultados. Una propuesta pendiente no está aplicada. Este registro puede incluir memorias de varios idiomas.")}</p>{error?<p role="alert">{tr(error)} <Button variant="secondary" onClick={()=>setAttempt(n=>n+1)}>{tr("Volver a intentar")}</Button></p>:records===null?<p role="status">{tr("Recuperando historial…")}</p>:records.length?records.map(d=><Card className="memory-detail-card" key={d.id}><p className="memory-small">{d.state==='applied'?tr("Guardado"):tr("Propuesta pendiente")} · {memoryTime(d.created_at,locale)}</p><p className="preserve">{d.summary}</p>{d.changes.map(c=><section key={c.noteId}><a href={memoryDetailHref(c.noteId)}>{c.title||tr("Abrir memoria actual")}</a><p className="preserve">{c.clarified}</p><p className="memory-small">{tr("Etiquetas:")+' '}{c.tags.join(' · ')||tr("Ninguna")}</p></section>)}{d.state!=='applied'&&<><p className="memory-small">{tr("Propuesta anterior: confirmar guarda el conjunto completo mostrado. El original se conserva; lo pendiente no está aplicado.")}</p><Button disabled={busy} onClick={()=>void apply(d)}>{busy?tr("Guardando…"):tr("Confirmar propuesta anterior")}</Button></>}</Card>):<p>{tr("No hay debriefings anteriores.")}</p>}</details>;
}
