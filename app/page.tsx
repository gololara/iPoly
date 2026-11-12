import {redirect} from 'next/navigation';
import {isLanguageId} from '@/lib/language';

export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {language,q}=await searchParams,params=new URLSearchParams();
 if(isLanguageId(language))params.set('language',language);
 if(typeof q==='string'&&q)params.set('q',q.slice(0,300));
 redirect('/memorias'+(params.size?'?'+params.toString():''));
}
