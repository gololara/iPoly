import {createHash,timingSafeEqual} from 'node:crypto';
import app from './sites-worker';

type SelfHostedEnv=Cloudflare.Env & {IPOLY_OWNER_PASSWORD?:string};
const username='ipoly';
const identityHeaders=[
 'oai-authenticated-user-id',
 'oai-authenticated-user-email',
 'oai-authenticated-user-full-name',
 'oai-authenticated-user-full-name-encoding',
];
const digest=(value:string)=>createHash('sha256').update(value).digest();

export default {
 async fetch(request:Request,env:SelfHostedEnv,ctx:Parameters<typeof app.fetch>[2]){
  const password=env.IPOLY_OWNER_PASSWORD;
  const privateHeaders={'Cache-Control':'private, no-store','Cross-Origin-Resource-Policy':'same-origin'};
  if(!password||!/^[A-Za-z0-9_-]{32,128}$/.test(password)){
   return new Response('Configure the IPOLY_OWNER_PASSWORD Worker secret.',{status:503,headers:privateHeaders});
  }
  const auth=request.headers.get('Authorization')??'';
  const expected=btoa(username+':'+password);
  if(auth.length!==expected.length+6||auth.slice(0,6).toLowerCase()!=='basic '||
     !timingSafeEqual(digest(auth.slice(6)),digest(expected))){
   return new Response('Sign in to iPoly.',{status:401,headers:{...privateHeaders,'WWW-Authenticate':'Basic realm="iPoly", charset="UTF-8"'}});
  }

  const origin=request.headers.get('Origin');
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&
     (request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))){
   return new Response('Use the iPoly origin.',{status:403,headers:privateHeaders});
  }

  const headers=new Headers(request.headers);
  headers.delete('Authorization');
  for(const name of identityHeaders)headers.delete(name);
  headers.set('oai-authenticated-user-id','ipoly-self-host-owner');
  headers.set('oai-authenticated-user-email','owner@ipoly.invalid');
  const response=await app.fetch(new Request(request,{headers}),env,ctx);
  const responseHeaders=new Headers(response.headers);
  for(const [name,value] of Object.entries(privateHeaders))responseHeaders.set(name,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:responseHeaders});
 },
};
