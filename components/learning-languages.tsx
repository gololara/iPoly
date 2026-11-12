'use client';
import {UiLocaleSelector,useUiText} from './ui-locale';
import {createContext,useContext,useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import {Plus} from 'lucide-react';
import type {LearningLanguage} from '@/lib/language';

const LanguageContext=createContext<{languages:LearningLanguage[];save:(name:string)=>Promise<LearningLanguage>}|null>(null);
export const useLearningLanguages=()=>useContext(LanguageContext);

export function LanguageWorkspace({initialLanguages,children}:{initialLanguages:LearningLanguage[];children:ReactNode}){
 const {t:tr}=useUiText();
 const [languages,setLanguages]=useState(initialLanguages);
 const emptyAtLoad=initialLanguages.length===0;
 useEffect(()=>{
  const controller=new AbortController();
  const refresh=()=>{
   void fetch('/api/languages',{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async r=>{
    if(!r.ok)return;
    const data=await r.json() as {languages:LearningLanguage[]};
    if(controller.signal.aborted)return;
    if(emptyAtLoad&&data.languages.length){location.reload();return;}
    // Languages are append-only, so an older response cannot hide a new choice.
    setLanguages(old=>[...old,...data.languages.filter(l=>!old.some(a=>a.id===l.id))]);
   }).catch(()=>{});
  };
  window.addEventListener('focus',refresh);
  return()=>{controller.abort();window.removeEventListener('focus',refresh);};
 },[emptyAtLoad]);
 async function save(name:string){
  const r=await fetch('/api/languages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  const data=await r.json() as {language:LearningLanguage;error?:string};
  if(!r.ok)throw Error(data.error??tr("No se pudo añadir el idioma."));
  setLanguages(old=>old.some(l=>l.id===data.language.id)?old:[...old,data.language]);
  return data.language;
 }
 return <LanguageContext.Provider value={{languages,save}}>{emptyAtLoad?<main className="memory-detail-page">
  <section className="memory-detail-shell"><div className="memory-detail-card ipoly-language-setup">
   <div className="ipoly-language-setup-header"><img src="/logo.png" width={100} height={50} alt="iPoly"/><UiLocaleSelector/></div>
   <h1>{tr("Elige tu primer idioma")}</h1>
   <p>{tr("¿Qué idioma quieres aprender? Podrás añadir más cuando quieras.")}</p>
   <LanguageForm onAdded={language=>location.assign('/memorias?'+new URLSearchParams({language:language.id}))}/>
   <p className="memory-small">{tr("¿Ya añadiste uno desde ChatGPT?")+' '}<button className="ipoly-text-button" type="button" onClick={()=>location.reload()}>{tr("Actualizar")}</button></p>
  </div></section>
 </main>:children}</LanguageContext.Provider>;
}

function LanguageForm({onAdded}:{onAdded:(language:LearningLanguage)=>void}){
 const {t:tr}=useUiText();
 const context=useLearningLanguages();
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!context||busy||!name.trim())return;
  setBusy(true);setError('');
  try{onAdded(await context.save(name));}
  catch(e){setError(e instanceof Error?e.message:tr("No se pudo añadir el idioma."));}
  finally{setBusy(false);}
 }
 return <form className="ipoly-language-form" onSubmit={submit}>
  <label>{tr("Idioma que quieres aprender")}<Input required maxLength={60} placeholder={tr("Por ejemplo, italiano")} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
  {error&&<p role="alert">{tr(error)}</p>}
  <Button type="submit" disabled={busy||!name.trim()}>{busy?tr("Guardando…"):tr("Añadir idioma")}</Button>
 </form>;
}

export function AddLearningLanguage({onAdded}:{onAdded:(id:string)=>void}){
 const {t:tr}=useUiText();
 const context=useLearningLanguages(),[open,setOpen]=useState(false);
 if(!context)return null;
 return <>
  <Button type="button" variant="ghost" size="sm" className="ipoly-add-language" aria-label={tr("Añadir idioma")} title={tr("Añadir idioma")} onClick={()=>setOpen(true)}><Plus aria-hidden="true" size={18}/><span>{tr("Añadir idioma")}</span></Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent>
   <DialogTitle>{tr("Añadir idioma")}</DialogTitle>
   <DialogDescription>{tr("Las memorias de cada idioma se guardan por separado.")}</DialogDescription>
   {open&&<LanguageForm onAdded={language=>{setOpen(false);onAdded(language.id);}}/>}
  </DialogContent></Dialog>
 </>;
}
