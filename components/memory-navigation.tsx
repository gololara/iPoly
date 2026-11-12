'use client';
import {UiLocaleSelector,useUiText} from './ui-locale';
import {AddLearningLanguage,useLearningLanguages} from './learning-languages';
import {learningLanguageName} from '@/lib/language';
import {Button} from './ui/button';
import type {Language} from '@/lib/model';
import {memoryListHref} from '@/lib/memory-detail';
export function MemoryLanguage({language,loading=false,onLanguage}:{language?:Language;loading?:boolean;onLanguage:(language:Language)=>void}){
 const {t:tr}=useUiText();
 const catalog=useLearningLanguages()?.languages??[];
 const options=!language||catalog.some(l=>l.id===language)?catalog:[...catalog,{id:language,name:learningLanguageName(language)}];
 return <div className="ipoly-language-controls">
  <UiLocaleSelector/>
  {language?<>
   <label className="memory-language"><span className="sr-only">{tr("Ver memorias por idioma")}</span><select value={language} onChange={e=>onLanguage(e.target.value as Language)}>{options.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><span aria-hidden="true">▾</span></label>
   <AddLearningLanguage onAdded={onLanguage}/>
  </>:<span className="memory-language-placeholder">{loading?tr("Cargando idioma…"):tr("Idioma no disponible")}</span>}
 </div>;
}
export function MemoryPrimaryNavigation({language,section='memories'}:{language?:Language;section?:'memories'|'teachers'}){
 const {t:tr}=useUiText();
 const list=memoryListHref(language);
 return <nav className="memory-detail-nav" aria-label={tr("Navegación principal")}><Button asChild variant={section==='memories'?'default':'ghost'} className="memory-nav-link"><a href={list} aria-current={section==='memories'?'location':undefined}>{tr("Memorias")}</a></Button><Button asChild variant={section==='teachers'?'default':'ghost'} className="memory-nav-link"><a aria-current={section==='teachers'?'location':undefined} href={'/maestros'+(language?'?language='+language:'')}>{tr("Maestros")}</a></Button></nav>;
}
export function MemoryNavigation({language,loading=false,onLanguage,section='memories'}:{language?:Language;loading?:boolean;onLanguage:(language:Language)=>void;section?:'memories'|'teachers'}){
 const {t:tr}=useUiText();
 return <div className="memory-detail-shell"><header className="memory-detail-header"><a href={memoryListHref(language)} aria-label={tr("iPoly · Volver a Memorias")}><img src="/logo.png" width="100" height="50" alt="iPoly"/></a><MemoryLanguage language={language} loading={loading} onLanguage={onLanguage}/></header><MemoryPrimaryNavigation language={language} section={section}/></div>;
}
