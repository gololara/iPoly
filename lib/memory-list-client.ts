import {isMemoryId} from './memory-detail';
import {memoryListSearch,normalizeMemoryFilters,type MemoryListFilters,type MemoryListItem,type MemoryListPage} from './memory-list-model';
export type MemoryListState={filterKey?:string;status:'loading'|'ready'|'error'|'interrupted';items:MemoryListItem[];nextOffset:number|null;failure?:'auth'|'network'|'invalid'};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const string=(v:unknown):v is string=>typeof v==='string';
const date=(v:unknown)=>string(v)&&Number.isFinite(Date.parse(v));
export function validMemoryList(value:unknown,filters:MemoryListFilters,offset:number):value is MemoryListPage{
 if(!object(value)||!Array.isArray(value.memories)||value.memories.length>20||!(value.nextOffset===null||value.nextOffset===offset+20))return false;
 if(value.nextOffset!==null&&value.memories.length!==20)return false;
 const seen=new Set<string>();return value.memories.every(m=>{if(!object(m)||!string(m.id)||!isMemoryId(m.id)||seen.has(m.id))return false;seen.add(m.id);return m.language===filters.language&&string(m.title)&&string(m.excerpt)&&date(m.createdAt)&&object(m.history)&&['debrief','class','user','ai','tutor'].every(k=>typeof (m.history as Record<string,unknown>)[k]==='boolean')&&(m.debriefAt===null||date(m.debriefAt))&&(m.classAt===null||date(m.classAt))&&(m.matchedExcerpt===null||string(m.matchedExcerpt));});
}
export function createMemoryListResource(fetcher:(url:string,options:RequestInit)=>Promise<Response>,publish:(s:MemoryListState)=>void,delay=180){
 let active=true,generation=0,controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|undefined,filters:MemoryListFilters={language:'sq',q:'',history:[]},key='',items:MemoryListItem[]=[],nextOffset:number|null=null,busy=false,lastOffset=0;
 const emit=(s:MemoryListState)=>{if(active)publish({...s,filterKey:key});};
 const invalidate=()=>{generation++;clearTimeout(timer);controller?.abort();busy=false;};
 const run=async(offset:number,request:number)=>{if(!active||request!==generation)return;busy=true;lastOffset=offset;controller=new AbortController();emit({status:'loading',items,nextOffset});
  try{const r=await fetcher('/api/memories?'+memoryListSearch(filters,offset),{method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!active||request!==generation)return;
   if(!r.ok){const failure=r.status===401||r.status===403?'auth':'network';if(failure==='auth'){items=[];nextOffset=null;}emit({status:'error',items,nextOffset,failure});return;}
   let body:unknown;try{body=await r.json();}catch{body=null;}if(!active||request!==generation)return;
   if(!validMemoryList(body,filters,offset)){items=[];nextOffset=null;emit({status:'error',items,nextOffset,failure:'invalid'});return;}
   const seen=new Set(offset?items.map(m=>m.id):[]);items=offset?[...items,...body.memories.filter(m=>!seen.has(m.id))]:body.memories;nextOffset=body.nextOffset;emit({status:'ready',items,nextOffset});
  }catch(e){if(!active||request!==generation)return;emit({status:object(e)&&e.name==='AbortError'?'interrupted':'error',items,nextOffset,failure:'network'});}finally{if(request===generation)busy=false;}
 };
 return {
  setFilters(next:MemoryListFilters){invalidate();const f=normalizeMemoryFilters(next),newKey=memoryListSearch(f);if(key!==newKey){items=[];nextOffset=null;}filters=f;key=newKey;lastOffset=0;busy=true;emit({status:'loading',items,nextOffset});const request=generation;timer=setTimeout(()=>{void run(0,request);},delay);},
  more(){if(!active||busy||nextOffset===null)return;invalidate();void run(nextOffset,generation);},
  retry(){invalidate();void run(lastOffset,generation);},
  interrupt(){invalidate();emit({status:'interrupted',items,nextOffset});},
  dispose(){active=false;invalidate();items=[];nextOffset=null;}
 };
}
