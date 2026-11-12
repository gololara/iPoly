import {LanguageWorkspace} from '@/components/learning-languages';
import {listLearningLanguages} from '@/lib/languages';
import {requireChatGPTUser} from '../../chatgpt-auth';
import MemoryDetail from '@/components/memory-detail';
import '../memory-detail.css';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const user=await requireChatGPTUser('/memorias/'+encodeURIComponent(id));
 const languages=await listLearningLanguages(user.userId);
 return <LanguageWorkspace key={user.userId} initialLanguages={languages}><MemoryDetail key={id} noteId={id} viewerId={user.userId}/></LanguageWorkspace>;
}
