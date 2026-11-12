import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},assetConfig:{html_handling:'none',not_found_handling:'none'}},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:()=>new Response('Blocked',{status:502})});
const owner='ui-language-fixture';
const call=(path,{locale,body,account=owner}={})=>mf.dispatchFetch('http://localhost'+path,{
 redirect:'manual',method:body?'POST':'GET',
 headers:{...(account?{'oai-authenticated-user-id':account,'oai-authenticated-user-email':account+'@example.test'}:{}),...(locale?{Cookie:'ipoly-ui-language='+locale}:{}),...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
const html=async(path,locale)=>{const r=await call(path,{locale});assert.equal(r.status,200);return r.text();};
try{
 const db=await mf.getD1Database('DB');
 for(const f of(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const es=await html('/memorias');
 assert.match(es,/<html[^>]*lang="es"/);assert.match(es,/Elige tu primer idioma/);
 const en=await html('/memorias','en');
 assert.match(en,/<html[^>]*lang="en"/);assert.match(en,/Choose your first language/);assert.match(en,/<button[^>]*aria-label="Interface language"/);
 const bad=await html('/memorias','__proto__');assert.match(bad,/<html[^>]*lang="es"/);
 assert.deepEqual((await (await call('/api/languages',{locale:'en'})).json()).languages,[],'choosing UI English must not create an English learning language');
 const invalid=await call('/api/notes',{locale:'en',body:{id:crypto.randomUUID(),language:'en',original:'No language configured'}});
 assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'Add this language to iPoly before saving.');
 const add=await call('/api/languages',{locale:'en',body:{name:'Italiano'}});assert.equal(add.status,201);
 const id=(await add.json()).language.id,noteId=crypto.randomUUID(),original='Esta captura está escrita en español.';
 assert.equal((await call('/api/notes',{locale:'en',body:{id:noteId,language:id,original}})).status,201);
 const memory=await (await call('/api/memories/'+noteId,{locale:'en'})).json();
 assert.equal(memory.memory.note.original,original);
 assert.equal(memory.memory.note.language,id);
 const memories=await html('/memorias?language='+id,'en');assert.match(memories,/>Memories</);assert.match(memories,/\/maestros\?language=/);assert.match(memories,/New memory|Restoring your memory draft/);
 assert.match(memories,/<div class="ipoly-language-controls"><button[^>]*aria-label="Interface language"[^>]*>.*?<label class="memory-language">/s);
 assert.equal([...memories.matchAll(/aria-label="Interface language"/g)].length,1);
 const teachers=await html('/maestros?language='+id,'en');assert.match(teachers,/<h1[^>]*>Teachers<\/h1>/);assert.match(teachers,/Add teacher/);assert.match(teachers,/View classes and history/);
 assert.match(await html('/maestros?language='+id,'es'),/<h1[^>]*>Maestros<\/h1>/);
 assert.match(await html('/clases?archive=preparations&language='+id,'en'),/Preparations and history/);
 const noAuth=await call('/maestros?language='+id,{locale:'en',account:null});assert.equal(noAuth.status,307);assert.equal(new URL(noAuth.headers.get('location'),'http://localhost').searchParams.get('return_to'),'/maestros?language='+id);
 console.log('Both UI locales, onboarding, navigation, preserved content, translated validation and archived class route verified.');
}finally{await mf.dispose();}
