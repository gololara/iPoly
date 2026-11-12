import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';

const password=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const authorization='Basic '+Buffer.from('ipoly:'+password).toString('base64');
const files=(await readdir('dist/server',{recursive:true})).filter(file=>file.endsWith('.js'));
const modules=files.map(file=>({type:'ESModule',path:resolve('dist/server',file)}));
const entry=modules.findIndex(module=>module.path===resolve('dist/server/index.js'));
assert.ok(entry>=0,'Build the standalone Worker before running this check');
modules.unshift(...modules.splice(entry,1));
const config={modules,modulesRoot:resolve('dist/server'),
 compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
 d1Databases:['DB'],r2Buckets:['BUCKET'],
 outboundService:()=>new Response('External networking disabled',{status:502}),
 assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true},assetConfig:{html_handling:'none',not_found_handling:'none'}},
};
const empty=new Miniflare(config);
try{
 assert.equal((await empty.dispatchFetch('http://localhost/memorias')).status,503);
}finally{await empty.dispose();}

const runtime=new Miniflare({...config,bindings:{IPOLY_OWNER_PASSWORD:password}});
const call=(path,options)=>runtime.dispatchFetch('http://localhost'+path,options);
const headers={authorization,'Content-Type':'application/json'};
try{
 const db=await runtime.getD1Database('DB');
 for(const file of (await readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort()){
  const statements=(await readFile('drizzle/'+file,'utf8')).split(';').filter(sql=>sql.trim());
  await db.batch(statements.map(sql=>db.prepare(sql)));
 }
 const forged={'oai-authenticated-user-id':'other-user','oai-authenticated-user-email':'other@example.test'};
 const unauthorized=await call('/api/languages',{headers:forged});
 assert.equal(unauthorized.status,401);
 assert.match(unauthorized.headers.get('www-authenticate')??'',/^Basic /);
 assert.equal((await call('/logo.png')).status,401);
 assert.equal((await call('/logo.png',{headers})).status,200);
 assert.equal((await call('/api/languages',{headers:{authorization:'Basic '+Buffer.from('ipoly:wrong').toString('base64')}})).status,401);
 const home=await call('/memorias',{headers});
 assert.equal(home.status,200);
 assert.match(await home.text(),/Elige tu primer idioma/);
 assert.match(home.headers.get('cache-control')??'',/no-store/);
 assert.deepEqual((await (await call('/api/languages',{headers})).json()).languages,[]);
 const addLanguage={method:'POST',body:JSON.stringify({name:'Italiano'})};
 assert.equal((await call('/api/languages',{...addLanguage,headers:{...headers,Origin:'https://example.test'}})).status,403);
 assert.equal((await call('/api/languages',{...addLanguage,headers:{...headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
 const added=await call('/api/languages',{...addLanguage,headers:{...headers,...forged,Origin:'http://localhost'}});
 assert.equal(added.status,201);
 const {language}=await added.json();
 assert.equal((await db.prepare('SELECT owner FROM learning_languages').first()).owner,'ipoly-self-host-owner');
 const note={id:crypto.randomUUID(),language:language.id,original:'An invented example for installation testing.'};
 const image=await readFile('public/icon-192.png');
 const photoId=crypto.randomUUID();
 const upload=new FormData();
 upload.set('noteId',note.id);
 upload.set('id',photoId);
 upload.set('file',new Blob([image],{type:'image/png'}),'sample.png');
 const encoded=new Request('http://localhost',{method:'POST',body:upload});
 const uploadResponse=await call('/api/uploads',{method:'POST',headers:{authorization,'Content-Type':encoded.headers.get('content-type')},body:await encoded.arrayBuffer()});
 assert.equal(uploadResponse.status,200);
 assert.equal((await call('/api/notes',{method:'POST',headers,body:JSON.stringify({...note,attachmentIds:[photoId]})})).status,201);
 assert.equal((await call('/api/files/'+photoId)).status,401);
 const file=await call('/api/files/'+photoId,{headers});
 assert.equal(file.status,200);
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),image);
 const rpc={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'ipoly_memoria',arguments:{id:note.id}}};
 const mcp=await call('/mcp',{method:'POST',headers,body:JSON.stringify(rpc)});
 assert.equal(mcp.status,200);
 const result=(await mcp.json()).result;
 assert.equal(result.isError,undefined);
 assert.equal(JSON.parse(result.content[0].text).note.original,note.original);
 console.log('Standalone authentication, blank install, data isolation, and authenticated MCP verified.');
}finally{await runtime.dispose();}
