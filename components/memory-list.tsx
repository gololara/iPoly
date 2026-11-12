'use client';
import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createMemoryListResource,type MemoryListState} from '@/lib/memory-list-client';
import {memoryFiltersFromSearch,memoryListSearch,type MemoryListFilters} from '@/lib/memory-list-model';
import {MemoryListView} from './memory-list-view';
import type {Language} from '@/lib/model';
export default function MemoryList({initialFilters,onCapture,captureReady,hasDraft,refreshKey,archive}:{initialFilters:MemoryListFilters;onCapture:(language:Language)=>void;captureReady:boolean;hasDraft:boolean;refreshKey:number;archive?:ReactNode}){
 const [filters,setFilters]=useState(initialFilters),[state,setState]=useState<MemoryListState>({status:'loading',items:[],nextOffset:null}),resource=useRef<ReturnType<typeof createMemoryListResource>|null>(null),key=memoryListSearch(filters);
 useEffect(()=>{const r=createMemoryListResource((url,options)=>fetch(url,options),setState);resource.current=r;const offline=()=>r.interrupt(),back=()=>setFilters(memoryFiltersFromSearch(location.search,initialFilters.language));window.addEventListener('offline',offline);window.addEventListener('popstate',back);return()=>{r.dispose();resource.current=null;window.removeEventListener('offline',offline);window.removeEventListener('popstate',back);};},[]);
 useEffect(()=>{resource.current?.setFilters(filters);history.replaceState(null,'','/memorias?'+key);},[key,refreshKey]);
 const displayed:MemoryListState=state.filterKey===key?state:{status:'loading',items:[],nextOffset:null};
 return <MemoryListView filters={filters} state={displayed} onFilters={setFilters} onRetry={()=>resource.current?.retry()} onMore={()=>resource.current?.more()} onInterrupt={()=>resource.current?.interrupt()} onCapture={()=>onCapture(filters.language)} captureReady={captureReady} hasDraft={hasDraft} archive={archive}/>;
}
