import {languageId} from '@/lib/language';
import {addLearningLanguage,listLearningLanguages} from '@/lib/languages';
import {storeMemoryMedia,discardMemoryMedia,previewMemoryMedia} from '@/lib/memory-media';
import {listMemoryProposals,readMemoryProposal,proposeMemoryContribution,applyMemoryContribution,cancelMemoryContribution} from '@/lib/memory-write';
import {listMemories} from '@/lib/memory-list';
import {readMemory} from '@/lib/memory-read';
import {getTeacher,listTeachers,createTeacher,updateTeacher} from '@/lib/teachers';
import {owner,json,body,failure} from '@/lib/http';
import {listTags,createNote,updateNote,storePhoto,storeAudio,discardUpload,attachment,ApiError} from '@/lib/data';
import {uiLocaleFromCookies} from '@/lib/ui-locale';

export const dynamic='force-dynamic';

async function mediaResponse(req:Request,who:string,id:string,preview:boolean){
 const {file,mime,size}=await (preview?previewMemoryMedia(who,id):attachment(who,id));
 const headers:Record<string,string>={
  'Content-Type':mime,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'",'Accept-Ranges':'bytes','Content-Length':String(size),
 };
 const range=req.headers.get('range');
 if(!range)return new Response(file.body,{headers});
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);
 const unsatisfiable=()=>new Response(null,{status:416,headers:{...headers,'Content-Length':'0','Content-Range':'bytes */'+size}});
 if(!match||(!match[1]&&!match[2]))return unsatisfiable();
 const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
 const end=match[1]?(match[2]?Math.min(size-1,Number(match[2])):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return unsatisfiable();
 const bytes=await file.arrayBuffer();
 return new Response(bytes.slice(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${size}`}});
}

async function upload(req:Request,who:string,kind:string){
 const audio=kind==='audio-uploads';
 const limit=(audio?2:8)*1024*1024+20000;
 if(Number(req.headers.get('content-length')||0)>limit)throw new ApiError(413,audio?'El audio supera 2 MB.':kind==='memory-uploads'?'El adjunto es demasiado grande.':'Usa una foto de hasta 8 MB.');
 const form=await req.formData(),file=form.get('file');
 if(!(file instanceof File))throw new ApiError(400,audio?'Falta el audio.':'Elige una foto.');
 const noteId=String(form.get('noteId')),id=String(form.get('id')),bytes=await file.arrayBuffer(),origin=String(form.get('origin')||'personal');
 if(kind==='memory-uploads')return json(await storeMemoryMedia(who,noteId,id,bytes,String(form.get('kind')),origin),201);
 return json(audio?await storeAudio(who,noteId,id,bytes):await storePhoto(who,noteId,id,bytes,origin));
}

async function handle(req:Request){
 try{
  const url=new URL(req.url),[path,id,...rest]=url.pathname.slice(5).split('/');
  const who=await owner(req),params=url.searchParams;
  if(rest.length)return json({error:'No encontramos esa acción.'},404);
  const offset=()=>Number(params.get('offset')??0);
  if(req.method==='GET'){
   switch(path){
    case 'languages':if(!id)return json({languages:await listLearningLanguages(who)});break;
    case 'tags':if(!id)return json({tags:await listTags(who)});break;
    case 'memories':{
     if(id)return json({memory:await readMemory(who,id)});
     const language=params.get('language')??(await listLearningLanguages(who))[0]?.id;
     return json(language?await listMemories(who,{language,q:params.get('q')??'',history:params.getAll('history'),offset:offset()}):{memories:[],nextOffset:null});
    }
    case 'teachers':return id?json({teacher:await getTeacher(who,id)}):json(await listTeachers(who,languageId.parse(params.get('language')),offset()));
    case 'memory-proposals':return id?json({proposal:await readMemoryProposal(who,id)}):json(await listMemoryProposals(who,params.get('noteId')??'',offset()));
    case 'files':
    case 'memory-upload-previews':if(id)return await mediaResponse(req,who,id,path==='memory-upload-previews');break;
   }
  }
  if(req.method==='POST'&&!id){
   switch(path){
    case 'languages':return json({language:await addLearningLanguage(who,await body(req))},201);
    case 'teachers':return json({teacher:await createTeacher(who,await body(req))},201);
    case 'notes':return json({note:await createNote(who,await body(req))},201);
    case 'memory-proposals':return json({proposal:await proposeMemoryContribution(who,await body(req))},201);
    case 'memory-approval':return json({proposal:await applyMemoryContribution(who,await body(req))});
    case 'memory-cancellation':return json({proposal:await cancelMemoryContribution(who,await body(req))});
    case 'memory-uploads':
    case 'audio-uploads':
    case 'uploads':return await upload(req,who,path);
   }
  }
  if(req.method==='PATCH'&&!id){
   if(path==='teachers')return json({teacher:await updateTeacher(who,await body(req))});
   if(path==='notes')return json({note:await updateNote(who,await body(req))});
  }
  if(req.method==='DELETE'&&id){
   if(path==='memory-uploads'){
    await discardMemoryMedia(who,id);
    return new Response(null,{status:204});
   }
   if(path==='uploads'){
    await discardUpload(who,id);
    return new Response(null,{status:204});
   }
  }
  return json({error:'No encontramos esa acción.'},404);
 }catch(e){return failure(e,uiLocaleFromCookies(req.headers.get('cookie')));}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
