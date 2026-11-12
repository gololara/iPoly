import {LanguageWorkspace} from '@/components/learning-languages';
import {listLearningLanguages} from '@/lib/languages';
import {isLanguageId} from '@/lib/language';
import {requireChatGPTUser} from '../chatgpt-auth';
import {SimpleClasses} from '@/components/simple-classes';
import '../memorias/memory-detail.css';
import './classes.css';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams,p=new URLSearchParams();
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:null;
 const classId=uuid(q.class),historyId=uuid(q.preparation);
 if(isLanguageId(q.language))p.set('language',q.language);
 if(classId)p.set('class',classId);if(historyId)p.set('preparation',historyId);if(q.archive==='preparations')p.set('archive','preparations');
 const user=await requireChatGPTUser('/clases'+(p.size?'?'+p.toString():''));
 const languages=await listLearningLanguages(user.userId),language=languages.find(l=>l.id===q.language)?.id??languages[0]?.id;
 return <LanguageWorkspace key={user.userId} initialLanguages={languages}>{language&&<SimpleClasses viewerId={user.userId} language={language} classId={classId} historyId={historyId} showArchive={q.archive==='preparations'}/>}</LanguageWorkspace>;
}
