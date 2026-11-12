import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {addLearningLanguage,listLearningLanguages} from '@/lib/languages';
import {languageId,languageIdPattern} from '@/lib/language';
import {listTeachers} from '@/lib/teachers';
import {modelGuidance,chatApproval} from '@/lib/model-guidance';
import {debriefGuidance} from '@/lib/debrief-guidance';
import {readMemory} from '@/lib/memory-read';
import {readMemoryProposal,proposeMemoryContribution,applyMemoryContribution,cancelMemoryContribution} from '@/lib/memory-write';
import {memoryToolDefinitions,memoryWriteToolNames} from '@/lib/memory-tools';
import {listNotes,listTags,createNote,ApiError,photo,audioAttachment} from '@/lib/data';
import {json,body,failure} from '@/lib/http';

const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'},id={type:'string',format:'uuid'};
const language={type:'string',pattern:languageIdPattern};
const languageFilter={type:'string',pattern:languageIdPattern.replace('sq|en','all|sq|en')};
const languageGuidance='Consulta ipoly_estado para conocer los idiomas configurados y sus IDs. Una instalación nueva empieza sin idiomas. Añade uno solo por petición explícita. El idioma de la memoria es el que se aprende, aunque el texto se escriba en otro.';
const guidance=languageGuidance+' '+modelGuidance;
const memoryTools=memoryToolDefinitions.map(t=>({...t,annotations:{readOnlyHint:!memoryWriteToolNames.includes(t.name),destructiveHint:['ipoly_aplicar_aportacion','ipoly_cancelar_aportacion'].includes(t.name),idempotentHint:true,openWorldHint:false}}));
const catalog=[
 {name:'ipoly_estado',description:'Consulta los idiomas y el recorrido de Memorias y Maestros.',inputSchema:obj({})},
 {name:'ipoly_notas',description:'Busca IDs de memorias por idioma, texto original, etiqueta o intervalo ISO. from inclusivo, to exclusivo. Lee ipoly_memoria para el original, aportes y autoría.',inputSchema:obj({language:languageFilter,tag:str,q:str,from:str,to:str,offset:{type:'integer',minimum:0,maximum:100000}})},
 {name:'ipoly_maestros',description:'Consulta los maestros del idioma de estudio de la memoria. Devuelve el ID, nombre e idiomas hablados de cada perfil. Si hay varias coincidencias, pregunta antes de atribuir.',inputSchema:obj({language,offset:{type:'integer',minimum:0,maximum:100000}},['language'])},
 {name:'ipoly_anadir_idioma',description:'Añade un idioma por petición explícita del usuario. Si ya existe, devuelve el mismo ID.',inputSchema:obj({name:{type:'string',minLength:1,maxLength:60},confirmed:{type:'boolean',const:true}},['name','confirmed'])},
 {name:'ipoly_guardar_nota',description:'Guarda la captura original literal del usuario en un idioma configurado. Usa un UUID estable al reintentar. Añade el análisis por separado con ipoly_proponer_aportacion.',inputSchema:obj({id,language,original:str,tags:{type:'array',items:str,maxItems:12}},['id','language','original'])},
 {name:'ipoly_imagen',description:'Recupera una imagen adjunta de una memoria propia.',inputSchema:obj({id},['id'])},
 {name:'ipoly_audio',description:'Recupera el audio adjunto de una memoria propia. La reproducción depende del cliente.',inputSchema:obj({id},['id'])},
].map(t=>({...t,annotations:{readOnlyHint:!['ipoly_anadir_idioma','ipoly_guardar_nota'].includes(t.name),destructiveHint:false,idempotentHint:true,openWorldHint:false}}));
const tools=[catalog[0],...memoryTools,...catalog.slice(1)];
const empty=z.object({}).strict();
const byId=z.object({id:z.string().uuid()}).strict();
const noteFilters=z.object({language:z.union([languageId,z.literal('all')]).optional(),tag:z.string().optional(),q:z.string().optional(),from:z.string().optional(),to:z.string().optional(),offset:z.number().int().min(0).max(100000).optional()}).strict();

async function runTool(userId:string,name:string,args:unknown){
 switch(name){
  case 'ipoly_memoria':return readMemory(userId,byId.parse(args).id);
  case 'ipoly_aportacion':return readMemoryProposal(userId,byId.parse(args).id);
  case 'ipoly_proponer_aportacion':return proposeMemoryContribution(userId,args);
  case 'ipoly_aplicar_aportacion':return applyMemoryContribution(userId,args);
  case 'ipoly_cancelar_aportacion':return cancelMemoryContribution(userId,args);
  case 'ipoly_notas':return listNotes(userId,noteFilters.parse(args));
  case 'ipoly_guardar_nota':return createNote(userId,args);
  case 'ipoly_maestros':{
   const {language,offset}=z.object({language:languageId,offset:z.number().int().min(0).max(100000).default(0)}).strict().parse(args);
   const {teachers,nextOffset}=await listTeachers(userId,language,offset);
   return {teachers:teachers.map(({id,name,languages})=>({id,name,languages})),nextOffset};
  }
  case 'ipoly_anadir_idioma':{
   const {name}=z.object({name:z.string(),confirmed:z.literal(true)}).strict().parse(args);
   return addLearningLanguage(userId,{name});
  }
  case 'ipoly_estado':{
   empty.parse(args);
   const learningLanguages=await listLearningLanguages(userId);
   return {version:'2.0.0',languages:learningLanguages.map(l=>l.id),learningLanguages,tags:await listTags(userId),
    memory:{instructions:guidance,web:'/memorias',readTool:'ipoly_memoria',approval:chatApproval},
    debriefing:{...debriefGuidance,saveTool:'ipoly_proponer_aportacion',applyTool:'ipoly_aplicar_aportacion'},
    teachers:{web:'/maestros',readTool:'ipoly_maestros'},
   };
  }
 }
 throw new ApiError(404,'No encontramos esa herramienta.');
}

function rpcError(id:unknown,code:number,message:string,status=200){
 return json({jsonrpc:'2.0',id,error:{code,message}},status);
}

export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin)throw new ApiError(403,'Esta acción debe iniciarse desde iPoly.');
  const rpc=await body(req);
  if(!rpc||rpc.jsonrpc!=='2.0')return rpcError(rpc?.id??null,-32600,'Invalid request',400);
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  let result:unknown;
  switch(rpc.method){
   case 'initialize':
    result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'iPoly',version:'2.0.0'},instructions:guidance};
    break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':{
    const user=await getChatGPTUser();
    if(!user)throw new ApiError(401,'Inicia sesión para conectar tu memoria de iPoly.');
    const {name,arguments:args={}}=rpc.params??{};
    if(!tools.some(t=>t.name===name))return rpcError(rpc.id,-32601,'Unknown tool');
    try{
     if(name==='ipoly_audio'||name==='ipoly_imagen'){
      const attachmentId=byId.parse(args).id;
      const {file,mime}=await (name==='ipoly_audio'?audioAttachment(user.userId,attachmentId):photo(user.userId,attachmentId));
      const bytes=new Uint8Array(await file.arrayBuffer());
      let binary='';
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
      result={content:[{type:name==='ipoly_audio'?'audio':'image',data:btoa(binary),mimeType:mime}]};
     }else{
      result={content:[{type:'text',text:JSON.stringify(await runTool(user.userId,name,args))}]};
     }
    }catch(e){
     const {error}=await failure(e).json() as {error:string};
     result={isError:true,content:[{type:'text',text:error}]};
    }
    break;
   }
   default:return rpcError(rpc.id,-32601,'Method not found');
  }
  return json({jsonrpc:'2.0',id:rpc.id??null,result});
 }catch(e){return failure(e);}
}
export function GET(){return new Response('Use POST /mcp',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});}
