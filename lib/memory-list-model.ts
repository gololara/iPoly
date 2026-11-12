import {isLanguageId} from './language';
import type {Language} from './model';
export const memoryHistoryFilters=['no_debrief','debrief','user','ai','tutor'] as const;
export type MemoryHistoryFilter=typeof memoryHistoryFilters[number];
export const memoryHistoryLabels:Record<MemoryHistoryFilter,string>={no_debrief:'Sin debrief guardado',debrief:'Con debrief guardado',user:'Con aportes tuyos',ai:'Con aportes de IA',tutor:'Con aportes del maestro'};
export type MemoryListFilters={language:Language;q:string;history:MemoryHistoryFilter[]};
export type MemoryListItem={id:string;language:Language;title:string;excerpt:string;createdAt:string;history:{debrief:boolean;user:boolean;ai:boolean;tutor:boolean};debriefAt:string|null;matchedExcerpt:string|null};
export type MemoryListPage={memories:MemoryListItem[];nextOffset:number|null};
export function normalizeMemoryFilters(filters:MemoryListFilters):MemoryListFilters{return {language:filters.language,q:filters.q.trim(),history:memoryHistoryFilters.filter(h=>filters.history.includes(h))};}
export function memoryListSearch(filters:MemoryListFilters,offset=0){const f=normalizeMemoryFilters(filters),p=new URLSearchParams({language:f.language});if(f.q)p.set('q',f.q);for(const h of f.history)p.append('history',h);if(offset)p.set('offset',String(offset));return p.toString();}
export function memoryFiltersFromSearch(search:string,fallback:Language='sq'):MemoryListFilters{const p=new URLSearchParams(search),language=p.get('language');return {language:isLanguageId(language)?language:fallback,q:(p.get('q')??'').slice(0,300),history:memoryHistoryFilters.filter(h=>p.getAll('history').includes(h))};}
