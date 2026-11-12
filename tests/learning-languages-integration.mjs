import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const modules=(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js'))
  .sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b)).map(f=>({type:'ESModule',path:resolve('dist/server',f)}));
let external=0;
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:()=>{external++;return new Response('Blocked',{status:502});}});
const A='new-owner',B='other-owner',L='historical-owner',at='2026-01-01T00:00:00Z';
const headers=who=>who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'}:{};
const fetch=(path,options={})=>mf.dispatchFetch('http://localhost'+path,options);
const api=(path,who=A,body,extra={})=>fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{...headers(who),'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
const mcp=(name,args={},who=A)=>fetch('/mcp',{method:'POST',headers:{...headers(who),'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
async function rpc(name,args,who){
 const res=await mcp(name,args,who);assert.equal(res.status,200);
 const {result}=await res.json();assert.ok(!result.isError,result.content[0].text);return JSON.parse(result.content[0].text);
}
const check=async(name,fn)=>{await fn();console.log('PASS '+name);};
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 const run=async name=>db.batch((await readFile('drizzle/'+name,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const migrations=(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort();
 for(const name of migrations.slice(0,-1))await run(name);
 const [sq,en,imageId,audioId,debriefId]=Array.from({length:5},()=>crypto.randomUUID());
 const image=await readFile('public/icon-192.png'),audio=await readFile('tests/fixtures/synthetic.m4a');
 for(const [id,lang,text] of [[sq,'sq','Original shqip'],[en,'en','Original English']])
  await db.prepare('INSERT INTO notes(id,owner,language,original,clarified,created_at,updated_at,version,request_hash) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,L,lang,text,'Anterior',at,at,2,id).run();
 for(const [id,note,bytes,mime,duration] of [[imageId,sq,image,'image/png',null],[audioId,en,audio,'audio/mp4',952]]){
  await bucket.put('legacy/'+id,bytes);
  await db.prepare('INSERT INTO attachments(id,owner,note_id,object_key,mime,size,origin,created_at,included,duration_ms) VALUES(?,?,?,?,?,?,?,?,1,?)').bind(id,L,note,'legacy/'+id,mime,bytes.length,'personal',at,duration).run();
 }
 const changes=JSON.stringify([{noteId:sq,expectedVersion:1,clarified:'Anterior',tags:[]}]);
 await db.prepare("INSERT INTO debriefs(id,owner,summary,changes,state,created_at,applied_at) VALUES(?,?,?,?,'applied',?,?)").bind(debriefId,L,'Historial previo',changes,at,at).run();
 await db.prepare('INSERT INTO revisions(id,owner,note_id,version,content,created_at) VALUES(?,?,?,?,?,?)').bind(debriefId+':'+sq,L,sq,2,JSON.stringify({before:{id:sq,original:'Original shqip'},after:{noteId:sq,expectedVersion:1,clarified:'Anterior',tags:[]}}),at).run();
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results.map(t=>t.name);
 const dump=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.prepare('SELECT * FROM "'+t+'"').all()).results])));
 const before=await dump();await run(migrations.at(-1));
 assert.equal((await db.prepare('SELECT count(*) AS total FROM learning_languages').first()).total,0);

 await check('migration preserves all existing rows and both legacy IDs and attachments',async()=>{
  assert.deepEqual(await dump(),before);
  assert.deepEqual((await rpc('ipoly_estado',{},L)).learningLanguages,[{id:'sq',name:'Shqip'},{id:'en',name:'English'}]);
  assert.equal((await rpc('ipoly_memoria',{id:sq},L)).note.original,'Original shqip');
  assert.equal((await rpc('ipoly_memoria',{id:en},L)).note.original,'Original English');
  for(const [id,bytes] of [[imageId,image],[audioId,audio]])assert.deepEqual(Buffer.from(await (await api('files/'+id,L)).arrayBuffer()),bytes);
 });
 await check('new owners start with zero languages and see onboarding; no implicit defaults',async()=>{
  assert.deepEqual(await (await api('languages')).json(),{languages:[]});
  assert.deepEqual((await rpc('ipoly_estado')).languages,[]);
  assert.match(await (await fetch('/memorias',{headers:headers(A)})).text(),/Elige tu primer idioma/);
  assert.equal((await api('notes',A,{id:crypto.randomUUID(),language:'sq',original:'No'})).status,400);
  assert.equal((await api('languages',null,{name:'Italiano'})).status,401);
  assert.equal((await api('languages',A,{name:'Italiano'},{origin:'https://other.invalid'})).status,403);
 });
 const first=await api('languages',A,{name:'Italiano'});assert.equal(first.status,201);
 const italian=(await first.json()).language;
 await check('web setup and Chat share the same catalogue and owner scope',async()=>{
  assert.deepEqual((await rpc('ipoly_estado')).learningLanguages,[italian]);
  assert.deepEqual((await rpc('ipoly_estado',{},B)).learningLanguages,[]);
  assert.equal((await api('notes',B,{id:crypto.randomUUID(),language:italian.id,original:'No'})).status,400);
  assert.doesNotMatch(await (await fetch('/memorias',{headers:headers(A)})).text(),/Elige tu primer idioma/);
  const bad=await mcp('ipoly_anadir_idioma',{name:'日本語',confirmed:false});assert.ok((await bad.json()).result.isError);
  assert.equal((await mcp('ipoly_anadir_idioma',{name:'日本語',confirmed:true},null)).status,401);
 });
 let japanese;
 await check('Chat can add a second language and concurrent retries stay idempotent',async()=>{
  const [one,two]=await Promise.all([rpc('ipoly_anadir_idioma',{name:'日本語',confirmed:true}),rpc('ipoly_anadir_idioma',{name:'日本語',confirmed:true})]);
  japanese=one;assert.deepEqual(one,two);
  const duplicate=await rpc('ipoly_anadir_idioma',{name:'  ITALIANO  ',confirmed:true});
  assert.deepEqual(duplicate,italian);
  assert.deepEqual((await (await api('languages')).json()).languages,[italian,japanese]);
  const fromChat=await rpc('ipoly_anadir_idioma',{name:'Français',confirmed:true},B);
  assert.deepEqual((await (await api('languages',B)).json()).languages,[fromChat]);
  const anotherWeb=await (await api('languages',B,{name:'Deutsch'})).json();
  assert.deepEqual((await rpc('ipoly_estado',{},B)).learningLanguages,[fromChat,anotherWeb.language]);
  assert.match(await (await fetch('/memorias?language='+japanese.id,{headers:headers(A)})).text(),/日本語/);
 });
 await check('new language supports literal capture and independent retrieval',async()=>{
  const firstNote=crypto.randomUUID(),secondNote=crypto.randomUUID();
  const literal='Me faltó una palabra; esta nota está en español.';
  const saved=await api('notes',A,{id:firstNote,language:italian.id,original:literal});assert.equal(saved.status,201);
  await rpc('ipoly_guardar_nota',{id:secondNote,language:japanese.id,original:'Otra captura'});
  assert.deepEqual((await rpc('ipoly_notas',{language:italian.id})).notes.map(n=>n.id),[firstNote]);
  const memory=await rpc('ipoly_memoria',{id:firstNote});
  assert.equal(memory.note.original,literal);assert.equal(memory.note.language,italian.id);
  const list=await (await api('memories?language='+japanese.id)).json();assert.deepEqual(list.memories.map(n=>n.id),[secondNote]);
 });
 await check('choosing Shqip first does not unlock English for a new account',async()=>{
  const who='first-shqip';
  const lang=await rpc('ipoly_anadir_idioma',{name:'Shqip',confirmed:true},who);
  await rpc('ipoly_guardar_nota',{id:crypto.randomUUID(),language:lang.id,original:'Nuevo'},who);
  assert.deepEqual((await rpc('ipoly_estado',{},who)).languages,['sq']);
 });
 assert.equal(external,0);
}finally{await mf.dispose();}
