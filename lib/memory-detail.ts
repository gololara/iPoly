import {isLanguageId} from './language';
import type {Language} from './model';
import type {MemoryActor,MemoryEntry,UnifiedMemory} from './memory-model';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isMemoryId=(value:string)=>uuid.test(value);
export const memoryDetailHref=(id:string)=>{if(!isMemoryId(id))throw Error('Invalid memory ID');return '/memorias/'+encodeURIComponent(id);};
export const memoryListHref=(language?:Language)=>'/memorias'+(language?'?language='+language:'');
export const memoryClassHref=(id:string,language:Language)=>isMemoryId(id)?'/clases?language='+language+'&preparation='+id:'/clases?language='+language;
export function memoryReturnLanguage(search:string):Language|'all'{const v=new URLSearchParams(search).get('language');return isLanguageId(v)?v:'all';}
export type MemoryDetailFailure='network'|'auth'|'not-found'|'conflict'|'invalid';
export type MemoryDetailState={status:'loading'|'ready'|'error'|'interrupted';memory:UnifiedMemory|null;failure?:MemoryDetailFailure};
export const memoryFailureText:Record<MemoryDetailFailure,string>={network:'No pudimos cargar la memoria. Comprueba tu conexión y vuelve a intentarlo.',auth:'Tu sesión no permite abrir esta memoria. Vuelve a Memorias para iniciar sesión.', 'not-found':'No encontramos esta memoria o ya no tienes acceso.',conflict:'No pudimos confirmar el historial. Vuelve a cargar la memoria.',invalid:'La respuesta no permite mostrar esta memoria con seguridad. Vuelve a intentarlo.'};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string';
const nullableText=(v:unknown)=>v===null||text(v);
const date=(v:unknown)=>text(v)&&Number.isFinite(Date.parse(v));
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const actor=(v:unknown)=>record(v)&&['user','ai','tutor','unknown'].includes(String(v.role))&&nullableText(v.id)&&nullableText(v.name);
const media=(v:unknown)=>record(v)&&text(v.id)&&isMemoryId(v.id)&&v.url==='/api/files/'+v.id&&text(v.mime)&&integer(v.size)&&text(v.origin)&&(v.duration_ms===null||integer(v.duration_ms));
const attribution=(v:unknown)=>v===undefined||(record(v)&&actor(v.originalAuthor)&&text(v.currentId)&&isMemoryId(v.currentId)&&Array.isArray(v.history)&&v.history.length>0&&v.history.every(h=>record(h)&&text(h.id)&&isMemoryId(h.id)&&actor(h.author)&&actor(h.proposedBy)&&actor(h.confirmedBy)&&date(h.proposedAt)&&date(h.confirmedAt)&&text(h.sourceContentHash)&&/^[a-f0-9]{64}$/.test(h.sourceContentHash)&&record(h.evidence)&&h.evidence.kind==='user_attestation'&&text(h.evidence.statement)&&nullableText(h.evidence.reference))&&v.history.at(-1).id===v.currentId);
const entry=(v:unknown)=>record(v)&&text(v.id)&&text(v.kind)&&text(v.text)&&text(v.context)&&date(v.createdAt)&&(v.appliedAt===null||date(v.appliedAt))&&actor(v.author)&&attribution(v.attribution)&&(v.recordedBy===null||actor(v.recordedBy))&&record(v.source)&&text(v.source.id)&&['capture','revision','class_session','contribution','legacy_clarification','debrief','closing'].includes(String(v.source.system))&&Array.isArray(v.attachments)&&v.attachments.every(a=>media(a)&&record(a)&&(a.speaker===null||actor(a.speaker))&&(a.recordedBy===null||actor(a.recordedBy))&&(a.consentRecordedAt===null||date(a.consentRecordedAt)))&&(v.details===undefined||record(v.details)&&Object.values(v.details).every(text));
export function isUnifiedMemory(value:unknown,id:string):value is UnifiedMemory{
 if(!record(value)||!record(value.note)||!record(value.history))return false;const n=value.note,h=value.history,attachments=n.attachments;if(!Array.isArray(attachments))return false;
 return n.id===id&&isLanguageId(n.language)&&text(n.original)&&text(n.clarified)&&text(n.title)&&date(n.created_at)&&date(n.updated_at)&&integer(n.version)&&n.version>0&&(n.worked===0||n.worked===1)&&(n.reviewed===0||n.reviewed===1)&&Array.isArray(n.tags)&&n.tags.every(t=>record(t)&&text(t.id)&&text(t.name)&&text(t.normalized))&&Array.isArray(n.attachments)&&n.attachments.every(media)&&Array.isArray(value.entries)&&value.entries.every(entry)&&value.entries.filter(e=>e.source.system==='capture').length===1&&value.entries.some(e=>e.source.system==='capture'&&e.source.id===id&&e.text===n.original&&e.attachments.length===attachments.length&&e.attachments.every((a:Record<string,unknown>,i:number)=>a.id===attachments[i].id&&a.url===attachments[i].url&&a.mime===attachments[i].mime))&&new Set(value.entries.map(e=>e.id)).size===value.entries.length&&Array.isArray(value.classContexts)&&value.classContexts.every(c=>record(c)&&text(c.classId)&&isMemoryId(c.classId)&&text(c.preparationId)&&isMemoryId(c.preparationId)&&text(c.closingId)&&isMemoryId(c.closingId)&&['source','preparation_reference'].includes(String(c.relation))&&date(c.createdAt)&&(c.appliedAt===null||date(c.appliedAt)))&&integer(value.pendingContributionCount)&&(value.contributionVersion===undefined||integer(value.contributionVersion))&&['hasAppliedDebrief','hasClassWork','hasUserContributions','hasAiContributions','hasTutorContributions'].every(k=>typeof h[k]==='boolean');
}
export function memoryActorLabel(a:MemoryActor|null,viewerId:string,t:(value:string)=>string=s=>s){
 if(!a)return t('No registrado');if(a.role==='unknown')return t('Autoría desconocida')+(a.name?' · '+a.name:'');
 if(a.name)return a.name;if(a.role==='user')return t(a.id===viewerId?'Tú':'Usuario');return t(a.role==='ai'?'IA':'Maestro sin nombre registrado');
}
export const memoryRoleLabel=(a:MemoryActor)=>({user:'Usuario',ai:'IA',tutor:'Maestro',unknown:'Autoría desconocida'})[a.role];
export const memoryEntryLabel=(e:MemoryEntry)=>({capture:'Original',addition:'Aporte',debrief:'Aclaración aprobada',correction:'Corrección',exercise:'Ejercicio',class_entry:'Aporte de clase',closing:'Actualización de clase',revision:'Versión guardada',legacy_clarification:'Aclaración guardada'}[e.kind]??'Aporte');
export function memoryTime(iso:string,locale='es'){return Number.isFinite(Date.parse(iso))?new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):locale==='en'?'Date not recorded':'Fecha no registrada';}
export function memorySnapshot(e:MemoryEntry,currentVersion?:number){return e.source.system==='revision'&&((e.kind!=='debrief'&&e.source.noteVersion!==currentVersion)||!!e.source.incorporatedEntryIds?.length);}
type FetchMemory=(url:string,options:RequestInit)=>Promise<Response>;
export function createMemoryDetailResource(fetcher:FetchMemory,publish:(state:MemoryDetailState)=>void){
 let active=true,generation=0,controller:AbortController|null=null,last:UnifiedMemory|null=null,currentId='';
 const emit=(state:MemoryDetailState)=>{if(active)publish(state);};
 return {
  async load(id:string){
   const request=++generation;controller?.abort();controller=new AbortController();currentId=id;if(last?.note.id!==id)last=null;
   emit({status:'loading',memory:last});if(!isMemoryId(id)){emit({status:'error',memory:null,failure:'not-found'});return;}
   try{
    const r=await fetcher('/api/memories/'+id,{method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!active||request!==generation)return;
    if(!r.ok){const failure:MemoryDetailFailure=r.status===401||r.status===403?'auth':r.status===404?'not-found':r.status===409?'conflict':'network';if(failure!=='network')last=null;emit({status:'error',memory:last,failure});return;}
    let body:unknown;try{body=await r.json();}catch{if(active&&request===generation){last=null;emit({status:'error',memory:null,failure:'invalid'});}return;}if(!active||request!==generation)return;
    if(!record(body)||!isUnifiedMemory(body.memory,id)){last=null;emit({status:'error',memory:null,failure:'invalid'});return;}
    last=body.memory;emit({status:'ready',memory:last});
   }catch(e){if(!active||request!==generation)return;emit({status:record(e)&&e.name==='AbortError'?'interrupted':'error',memory:last,...(record(e)&&e.name==='AbortError'?{}:{failure:'network' as const})});}
  },
  interrupt(){generation++;controller?.abort();emit({status:'interrupted',memory:last?.note.id===currentId?last:null});},
  dispose(){active=false;generation++;controller?.abort();last=null;}
 };
}
