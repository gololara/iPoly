'use client';
import {useEffect,useRef,useState} from 'react';
import {createMemoryDetailResource,memoryListHref,type MemoryDetailState} from '@/lib/memory-detail';
import {MemoryContribution} from './memory-contribution';
import {MemoryMetadata} from './memory-metadata';
import {MemoryDetailView} from './memory-detail-view';
export default function MemoryDetail({noteId,viewerId}:{noteId:string;viewerId:string}){
 const [state,setState]=useState<MemoryDetailState>({status:'loading',memory:null}),resource=useRef<ReturnType<typeof createMemoryDetailResource>|null>(null);
 useEffect(()=>{const next=createMemoryDetailResource((url,options)=>fetch(url,options),setState);resource.current=next;void next.load(noteId);const offline=()=>next.interrupt();window.addEventListener('offline',offline);return()=>{next.dispose();resource.current=null;window.removeEventListener('offline',offline);};},[noteId]);
 return <MemoryDetailView metadata={state.memory?<MemoryMetadata memory={state.memory} enabled={state.status==='ready'} onSaved={()=>void resource.current?.load(noteId)}/>:undefined} contribution={state.memory?<MemoryContribution enabled={state.status==='ready'} memory={state.memory} viewerId={viewerId} onSaved={()=>void resource.current?.load(noteId)}/>:undefined} state={state} viewerId={viewerId} onRetry={()=>{void resource.current?.load(noteId);}} onInterrupt={()=>resource.current?.interrupt()} onLanguage={language=>{window.location.assign(memoryListHref(language));}}/>;
}
