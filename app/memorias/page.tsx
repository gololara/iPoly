import {LanguageWorkspace} from '@/components/learning-languages';
import {listLearningLanguages} from '@/lib/languages';
import MemoryHome from '@/components/memory-home';
import {requireChatGPTUser} from '../chatgpt-auth';
import {memoryFiltersFromSearch} from '@/lib/memory-list-model';
import './memory-detail.css';
import './memory-list.css';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const input=await searchParams,p=new URLSearchParams();for(const key of ['language','q','history']){const values=input[key];for(const value of Array.isArray(values)?values:values?[values]:[])p.append(key,value);}if(input.archive==='debriefs')p.set('archive','debriefs');const user=await requireChatGPTUser('/memorias?'+p.toString());const languages=await listLearningLanguages(user.userId),first=languages[0]?.id;
const filters=first?memoryFiltersFromSearch(p.toString(),first):null;
if(filters&&!languages.some(l=>l.id===filters.language))filters.language=first!;
return <LanguageWorkspace key={user.userId} initialLanguages={languages}>{filters&&<MemoryHome viewerId={user.userId} filters={filters} showHistory={input.archive==='debriefs'}/>}</LanguageWorkspace>;}
