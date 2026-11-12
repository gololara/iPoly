import {getChatGPTUser} from '@/app/chatgpt-auth';
import {ApiError} from './data';
import {ZodError} from 'zod';
import {uiText,type UiLocale} from './ui-locale';
export async function owner(request:Request){const user=await getChatGPTUser();if(!user)throw new ApiError(401,'Inicia sesión para abrir tu memoria.');if(!['GET','HEAD'].includes(request.method)){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError(403,'Esta acción debe iniciarse desde iPoly.');}return user.userId;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function body(request:Request){if(Number(request.headers.get('content-length')||0)>150000)throw new ApiError(413,'El contenido es demasiado grande.');const text=await request.text();if(text.length>150000)throw new ApiError(413,'El contenido es demasiado grande.');try{return JSON.parse(text);}catch{throw new ApiError(400,'No pudimos leer el contenido.');}}
export function failure(e:unknown,locale:UiLocale='es'){const t=(message:string)=>uiText(locale,message);if(e instanceof ApiError)return json({error:t(e.message)},e.status);if(e instanceof ZodError)return json({error:t('Revisa los datos:')+' '+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; ')},400);console.error('iPoly request failed',e);return json({error:t('No pudimos guardar o recuperar tus datos. Tu borrador se conserva; vuelve a intentarlo.')},503);}
