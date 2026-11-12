'use client';
import {useLearningLanguages} from './learning-languages';
import {learningLanguageName} from '@/lib/language';
import {useUiText} from './ui-locale';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import {teacherInitials,type Teacher} from '@/lib/teacher-model';
class RequestError extends Error{constructor(public status:number,message:string){super(message);}}
async function request<T=unknown>(path:string,options?:RequestInit):Promise<T>{const r=await fetch('/api/teachers'+path,options),data=await r.json() as T&{error?:string};if(!r.ok)throw new RequestError(r.status,data.error||'No pudimos recuperar tus maestros.');return data;}
export function TeacherProfiles({language}:{language:string}){
 const {t:tr}=useUiText();
 const catalogue=useLearningLanguages()?.languages??[];
 const languageName=learningLanguageName(language,catalogue);
 const [teachers,setTeachers]=useState<Teacher[]>([]),[next,setNext]=useState<number|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [formOpen,setFormOpen]=useState(false),[editing,setEditing]=useState<Teacher|null>(null),[formId,setFormId]=useState(''),[name,setName]=useState(''),[languages,setLanguages]=useState(''),[formBusy,setFormBusy]=useState(false),[formError,setFormError]=useState(''),[conflict,setConflict]=useState<Teacher|null>(null);
 const generation=useRef(0),editorGeneration=useRef(0),requestId=useRef('');
 const load=useCallback(async(offset=0)=>{const gen=++generation.current;setLoading(true);setError('');try{const data=await request<{teachers:Teacher[];nextOffset:number|null}>('?'+new URLSearchParams({language,offset:String(offset)}));if(gen===generation.current){setTeachers(old=>offset?[...old,...data.teachers]:data.teachers);setNext(data.nextOffset);}}catch(e){if(gen===generation.current)setError((e as Error).message);}finally{if(gen===generation.current)setLoading(false);}},[language]);
 useEffect(()=>{
  void load();
  return()=>{generation.current++;editorGeneration.current++;};
 },[load]);
 function draftChanged(){requestId.current=crypto.randomUUID();}
 function add(){editorGeneration.current++;setEditing(null);setFormId(crypto.randomUUID());setName('');setLanguages('');setConflict(null);setFormError('');draftChanged();setFormOpen(true);}
 async function edit(t:Teacher){const gen=++editorGeneration.current;setError('');try{const data=await request<{teacher:Teacher}>('/'+t.id);if(gen!==editorGeneration.current)return;const current=data.teacher;setEditing(current);setFormId(current.id);setName(current.name);setLanguages(current.languages.join(', '));setConflict(null);setFormError('');draftChanged();setFormOpen(true);}catch(e){if(gen===editorGeneration.current)setError((e as Error).message);}}
 async function save(){if(formBusy||!name.trim())return;setFormBusy(true);setFormError('');try{await request('',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:formId,name,languageId:language,languages:languages.split(',').map(s=>s.trim()).filter(Boolean),...(editing?{expectedVersion:editing.version,requestId:requestId.current}:{})})});setFormOpen(false);setConflict(null);await load();toast.success(editing?tr("Perfil actualizado."):tr("Maestro agregado."));}catch(e){setFormError((e as Error).message);if(e instanceof RequestError&&e.status===409&&editing){try{const current=await request<{teacher:Teacher}>('/'+editing.id);setConflict(current.teacher);}catch{}}}finally{setFormBusy(false);}}
 return <section className="teacher-profiles" aria-labelledby="teachers-title"><div className="teacher-heading"><div><h1 id="teachers-title">{tr("Maestros")}</h1><p>{tr("Idioma de estudio:")} {languageName}</p></div><Button disabled={formBusy||loading} onClick={add}>{tr("Agregar maestro")}</Button></div>{error&&<div className="error-box" role="alert"><p>{tr(error)}</p><Button variant="secondary" onClick={()=>load()}>{tr("Volver a intentar")}</Button></div>}{loading&&!teachers.length?<p role="status">{tr("Recuperando maestros…")}</p>:!teachers.length&&!error?<section className="teacher-empty"><h3>{tr("No hay maestros para este idioma.")}</h3><p>{tr("Empieza por un nombre. Puedes añadir los demás datos después.")}</p></section>:<div className="teachers-grid">{teachers.map(t=><article className="note-card teacher-card" key={t.id}><div className="teacher-identity"><span className="teacher-avatar" aria-hidden="true">{teacherInitials(t.name)}</span><h3>{t.name}</h3></div><p><strong>{tr("Idiomas que habla:")}</strong> {t.languages.join(', ')||tr("Por añadir")}</p><Button variant="secondary" disabled={formBusy} aria-label={tr("Editar perfil de")+' '+t.name} onClick={()=>edit(t)}>{tr("Editar perfil")}</Button></article>)}</div>}{next!==null&&<Button variant="secondary" disabled={loading} onClick={()=>load(next)}>{tr("Ver más maestros")}</Button>}
  <Dialog open={formOpen} onOpenChange={v=>!formBusy&&setFormOpen(v)}>
   <DialogContent className="detail-dialog teacher-dialog">
    <DialogTitle>{editing?tr("Editar maestro"):tr("Agregar maestro")}</DialogTitle>
    <DialogDescription>{tr("Solo el nombre es obligatorio. Los perfiles son privados.")}</DialogDescription>
    <p className="memory-small">{tr("Idioma de estudio:")} {languageName}</p>
    <label>{tr("Nombre del maestro")}
     <Input autoFocus required maxLength={120} disabled={formBusy} value={name} onChange={e=>{setName(e.target.value);draftChanged();}} autoComplete="off"/>
    </label>
    <label>{tr("Idiomas que habla · opcional")}
     <Input maxLength={1200} disabled={formBusy} value={languages} onChange={e=>{setLanguages(e.target.value);draftChanged();}} placeholder={tr("Separados por comas")}/>
    </label>
    {formError&&<p role="alert">{tr(formError)}</p>}
    {conflict&&<section className="original">
     <h3>{tr("Versión actual del perfil")}</h3>
     <p>{conflict.name}</p>
     <p>{tr("Idiomas:")+' '}{conflict.languages.join(', ')||tr("Por añadir")}</p>
     <p className="small">{tr("Tu borrador sigue en los campos. Puedes revisarlo sobre esta versión antes de guardar.")}</p>
     <Button variant="secondary" disabled={formBusy} onClick={()=>{
      setEditing(conflict);
      setConflict(null);
      setFormError(tr("Revisa tus cambios y guarda cuando estén listos."));
      draftChanged();
     }}>{tr("Revisar mi borrador sobre esta versión")}</Button>
    </section>}
    <div className="teacher-form-actions">
     <Button disabled={formBusy||!name.trim()||!!conflict} onClick={save}>{formBusy?tr("Guardando…"):editing?tr("Guardar cambios"):tr("Guardar maestro")}</Button>
     <Button variant="secondary" disabled={formBusy} onClick={()=>setFormOpen(false)}>{tr("Cancelar")}</Button>
    </div>
   </DialogContent>
  </Dialog>
 </section>;
}
