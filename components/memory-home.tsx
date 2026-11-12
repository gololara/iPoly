'use client';
import {useState} from 'react';
import MemoryList from './memory-list';
import {MemoryCapture} from './memory-capture';
import {HistoricalDebriefs} from './memory-history';
import type {MemoryListFilters} from '@/lib/memory-list-model';
export default function MemoryHome({viewerId,filters,showHistory=false}:{viewerId:string;filters:MemoryListFilters;showHistory?:boolean}){
 const [reload,setReload]=useState(0);
 return <MemoryCapture viewerId={viewerId} onSaved={()=>setReload(n=>n+1)}>{controls=><MemoryList initialFilters={filters} refreshKey={reload} {...controls} archive={<HistoricalDebriefs initiallyOpen={showHistory} onSaved={()=>setReload(n=>n+1)}/>}/>}</MemoryCapture>;
}
