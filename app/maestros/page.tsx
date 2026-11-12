import {LanguageWorkspace} from '@/components/learning-languages';
import {TeachersHome} from '@/components/teachers-home';
import {listLearningLanguages} from '@/lib/languages';
import {isLanguageId} from '@/lib/language';
import {requireChatGPTUser} from '../chatgpt-auth';
import '../memorias/memory-detail.css';

export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams;
 const user=await requireChatGPTUser('/maestros'+(isLanguageId(q.language)?'?'+new URLSearchParams({language:q.language}):''));
 const languages=await listLearningLanguages(user.userId),language=languages.find(l=>l.id===q.language)?.id??languages[0]?.id;
 return <LanguageWorkspace key={user.userId} initialLanguages={languages}>{language&&<TeachersHome language={language}/>}</LanguageWorkspace>;
}
