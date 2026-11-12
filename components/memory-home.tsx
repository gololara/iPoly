'use client';
import {useState} from 'react';
import MemoryList from './memory-list';
import {MemoryCapture} from './memory-capture';
import type {MemoryListFilters} from '@/lib/memory-list-model';
export default function MemoryHome({viewerId,filters}:{viewerId:string;filters:MemoryListFilters}){
 const [reload,setReload]=useState(0);
 return <MemoryCapture viewerId={viewerId} onSaved={()=>setReload(n=>n+1)}>{controls=><MemoryList initialFilters={filters} refreshKey={reload} {...controls}/>}</MemoryCapture>;
}
