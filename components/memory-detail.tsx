'use client';
import {useUiText} from './ui-locale';
import {useEffect,useRef,useState} from 'react';
import {createMemoryDetailResource,memoryListHref,type MemoryDetailState} from '@/lib/memory-detail';
import {Button} from './ui/button';
import {MemoryContribution} from './memory-contribution';
import {MemoryMetadata} from './memory-metadata';
import {MemoryDetailView} from './memory-detail-view';
export default function MemoryDetail({noteId,viewerId,classId=null}:{noteId:string;viewerId:string;classId?:string|null}){
 const {t:tr}=useUiText();
 const [classContext,setClassContext]=useState<{id:string;title:string;language:string}|null>(null),[classError,setClassError]=useState('');
 useEffect(()=>{if(!classId)return;let alive=true;void fetch('/api/classes/'+classId,{cache:'no-store',credentials:'same-origin'}).then(async r=>{const d=await r.json() as any;if(!r.ok||!d.memories?.some((n:any)=>n.noteId===noteId))throw Error(tr("No pudimos confirmar esta memoria en la clase. Vuelve a Clases para recuperarla."));if(alive)setClassContext(d);}).catch(e=>alive&&setClassError(e.message));return()=>{alive=false;};},[classId,noteId]);
 const [state,setState]=useState<MemoryDetailState>({status:'loading',memory:null}),resource=useRef<ReturnType<typeof createMemoryDetailResource>|null>(null);
 useEffect(()=>{const next=createMemoryDetailResource((url,options)=>fetch(url,options),setState);resource.current=next;void next.load(noteId);const offline=()=>next.interrupt();window.addEventListener('offline',offline);return()=>{next.dispose();resource.current=null;window.removeEventListener('offline',offline);};},[noteId]);
 return <MemoryDetailView metadata={state.memory?<MemoryMetadata memory={state.memory} enabled={state.status==='ready'} onSaved={()=>void resource.current?.load(noteId)}/>:undefined} classContext={classContext?<Button variant="secondary" asChild><a href={'/clases?language='+classContext.language+'&class='+classContext.id}>{tr("‹ Volver a")+' '}{classContext.title}</a></Button>:classId?<p role={classError?'alert':'status'}>{classError?tr(classError):tr("Recuperando contexto de la clase…")}</p>:undefined} contribution={state.memory&&(!classId||classContext)?<MemoryContribution enabled={state.status==='ready'} classId={classContext?.id??null} memory={state.memory} viewerId={viewerId} onSaved={()=>void resource.current?.load(noteId)}/>:undefined} state={state} viewerId={viewerId} onRetry={()=>{void resource.current?.load(noteId);}} onInterrupt={()=>resource.current?.interrupt()} onLanguage={language=>{window.location.assign(memoryListHref(language));}}/>;
}
