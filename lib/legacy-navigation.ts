import {isLanguageId} from './language';
// Keep old bookmarked URLs useful without mounting the retired workspace.
export function legacyDestination(input:Record<string,string|string[]|undefined>){
 const one=(key:string)=>typeof input[key]==='string'?input[key] as string:undefined;
 const language=one('language'),p=new URLSearchParams();
 if(isLanguageId(language))p.set('language',language);
 if(one('view')==='tutor'){
  const id=one('preparation');
  if(id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))p.set('preparation',id);
  else p.set('archive','preparations');
  return '/clases?'+p.toString();
 }
 if(one('view')==='debrief')p.set('archive','debriefs');
 if(one('view')==='today')p.set('history','no_debrief');
 const q=one('q');if(q)p.set('q',q.slice(0,300));
 return '/memorias'+(p.size?'?'+p.toString():'');
}
