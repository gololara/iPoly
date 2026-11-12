import {LanguageWorkspace} from '@/components/learning-languages';
import {listLearningLanguages} from '@/lib/languages';
import {requireChatGPTUser} from '../../chatgpt-auth';
import MemoryDetail from '@/components/memory-detail';
import {isMemoryId} from '@/lib/memory-detail';
import '../memory-detail.css';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {id}=await params,q=await searchParams,classId=typeof q.class==='string'&&isMemoryId(q.class)?q.class:null;
 const user=await requireChatGPTUser('/memorias/'+encodeURIComponent(id)+(classId?'?'+new URLSearchParams({class:classId}):''));
 const languages=await listLearningLanguages(user.userId);
 return <LanguageWorkspace key={user.userId} initialLanguages={languages}><MemoryDetail key={id} noteId={id} viewerId={user.userId} classId={classId}/></LanguageWorkspace>;
}
