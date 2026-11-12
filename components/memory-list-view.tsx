'use client';
import {useUiText} from './ui-locale';
import {Button} from './ui/button';
import {Card} from './ui/card';
import {Skeleton} from './ui/skeleton';
import {useRef,useState} from 'react';
import {Plus} from 'lucide-react';
import {MemoryListHeader} from './memory-list-header';
import {memoryDetailHref} from '@/lib/memory-detail';
import type {MemoryListFilters,MemoryListItem} from '@/lib/memory-list-model';
import type {MemoryListState} from '@/lib/memory-list-client';
const shortDate=(value:string,locale:string)=>new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short'}).format(new Date(value));
function History({memory}:{memory:MemoryListItem}){
 const {t:tr,locale}=useUiText();return <p className="memory-list-meta"><time dateTime={memory.createdAt}>{shortDate(memory.createdAt,locale)}</time>{memory.history.debrief?<span>{tr("Debrief")}{memory.debriefAt&&<> · <time dateTime={memory.debriefAt}>{shortDate(memory.debriefAt,locale)}</time></>}</span>:<span>{tr("Sin debrief guardado")}</span>}{memory.history.user&&<span>{tr("Aporte tuyo")}</span>}{memory.history.ai&&<span>{tr("Aporte de IA")}</span>}{memory.history.tutor&&<span>{tr("Aporte del maestro")}</span>}</p>;}
export type MemoryListViewProps={filters:MemoryListFilters;state:MemoryListState;onFilters:(f:MemoryListFilters)=>void;onRetry:()=>void;onMore:()=>void;onInterrupt:()=>void;onCapture:()=>void;captureReady:boolean;hasDraft:boolean};
export function MemoryListView({filters,state,onFilters,onRetry,onMore,onInterrupt,onCapture,captureReady,hasDraft}:MemoryListViewProps){
 const {t:tr,locale}=useUiText();
 const [historyOpen,setHistoryOpen]=useState(false);
 const content=useRef<HTMLDivElement>(null);
 const capture=()=>{setHistoryOpen(false);onCapture();};
 const captureLabel=!captureReady?tr("Recuperando borrador de memoria…"):hasDraft?tr("Continuar borrador de memoria"):tr("Nueva memoria");
 return <div className="memory-detail-page memory-list-page">
 <a href="#memory-list-content" className="memory-skip" onClick={e=>{e.preventDefault();content.current?.scrollIntoView({block:'start',behavior:'instant'});content.current?.focus({preventScroll:true});}}>{tr("Ir al contenido")}</a>
 <MemoryListHeader filters={filters} onFilters={onFilters} open={historyOpen} onOpenChange={setHistoryOpen}/>
 <main className="memory-list-main" aria-labelledby="memory-list-title"><div className="memory-list-body" id="memory-list-content" ref={content} tabIndex={-1}>
 {(state.status==='error'||state.status==='interrupted')&&<Card className="memory-detail-card memory-load-error" role="alert"><h2>{state.status==='interrupted'?tr("Búsqueda interrumpida"):tr("No pudimos recuperar las memorias")}</h2><p>{state.failure==='auth'?tr("Tu sesión no permite leer estas memorias. Vuelve a iniciar sesión."):state.failure==='invalid'?tr("La respuesta no permite mostrar los resultados con seguridad."):tr("Comprueba tu conexión y vuelve a intentarlo.")}</p>{state.items.length>0&&<p>{tr("Se conserva la última lectura disponible; puede haber cambiado.")}</p>}<Button variant="secondary" onClick={onRetry}>{tr("Volver a intentar")}</Button></Card>}
 <p className="sr-only" role="status" aria-live="polite">{state.status==='loading'?tr("Buscando memorias…"):state.status==='ready'?state.items.length+' '+tr(state.items.length===1?'memoria':'memorias')+(state.nextOffset!==null?' '+tr('cargadas'):''):''}</p><section aria-label={tr("Memorias guardadas")} aria-busy={state.status==='loading'}>{state.status==='loading'&&state.items.length===0?<div className="memory-skeletons" aria-hidden="true"><Skeleton className="memory-skeleton"/><Skeleton className="memory-skeleton"/></div>:<ul className="memory-list-results">{state.items.map(m=><li key={m.id}><a className="memory-list-link" href={memoryDetailHref(m.id)}><Card className="memory-detail-card"><History memory={m}/><h2>{m.title}</h2>{m.excerpt&&<p className="memory-list-excerpt">{m.excerpt}</p>}{m.matchedExcerpt&&m.matchedExcerpt.trim()!==m.excerpt.trim()&&m.matchedExcerpt.trim()!==m.title.trim()&&<p className="memory-match"><span>{tr("Coincidencia en la memoria")}</span>{m.matchedExcerpt}</p>}</Card></a></li>)}</ul>}
 {state.status==='ready'&&!state.items.length&&<Card className="memory-detail-card memory-list-empty"><h2>{tr("No hay memorias con estos filtros.")}</h2><p>{tr("Prueba otra frase, idioma o combinación de historial.")}</p>{(filters.q||filters.history.length>0)&&<Button variant="secondary" onClick={()=>onFilters({...filters,q:'',history:[]})}>{tr("Quitar búsqueda y filtros")}</Button>}</Card>}
 </section>{state.status==='loading'&&<Button variant="ghost" onClick={onInterrupt}>{tr("Detener búsqueda")}</Button>}{state.nextOffset!==null&&<Button variant="secondary" disabled={state.status==='loading'} onClick={onMore}>{tr("Ver más memorias")}</Button>}<p className="memory-list-help">{tr("Busca también dentro de lo que añadimos después.")}</p></div></main><Button type="button" className="memory-capture-fab" aria-label={captureLabel} title={captureLabel} onClick={capture} disabled={!captureReady}><Plus aria-hidden="true"/></Button></div>;
}
