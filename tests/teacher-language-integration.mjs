import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:()=>new Response('Blocked',{status:502})});
const A='teacher-language-owner',B='another-owner',uid=()=>crypto.randomUUID(),at='2026-01-01T00:00:00Z';
async function call(path,method='GET',body,who=A){
 const r=await mf.dispatchFetch('http://localhost'+path,{method,headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
const rpc=(name,args,who)=>call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},who);
async function run(name,args){const {data}=await rpc(name,args);assert.equal(data.result.isError,undefined,data.result.content[0].text);return JSON.parse(data.result.content[0].text);}
try{
 const db=await mf.getD1Database('DB'),migrations=(await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort();
 const migrate=async f=>db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 for(const f of migrations.slice(0,-1))await migrate(f);
 const legacy=uid(),sq=uid(),entry=uid();
 await db.prepare('INSERT INTO teachers(id,owner,name,languages,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(legacy,A,'Maestra anterior','["Shqip Geg","Inglés"]',legacy,at,at).run();
 await db.prepare("INSERT INTO notes(id,owner,language,original,request_hash,created_at,updated_at) VALUES(?,?,'sq','Original histórico',?,?,?)").bind(sq,A,sq,at,at).run();
 await db.prepare("INSERT INTO memory_contributions(id,owner,note_id,kind,text,context,author_role,author_id,author_name,recorder_role,recorded_by,state,approved_by,created_at,applied_at) VALUES(?,?,?,'addition','Aporte histórico','', 'tutor',?,?,'user',?,'applied',?,?,?)").bind(entry,A,sq,legacy,'Maestra anterior',A,A,at,at).run();
 const before=await run('ipoly_memoria',{id:sq});
 await migrate(migrations.at(-1));
 assert.deepEqual(await run('ipoly_memoria',{id:sq}),before);
 const turco=(await call('/api/languages','POST',{name:'Turco'})).data.language.id;
 const turcoNote=uid();
 assert.equal((await call('/api/notes','POST',{id:turcoNote,language:turco,original:'Captura en español'})).status,201);
 const teachers=async language=>(await call('/api/teachers?language='+language)).data.teachers.map(x=>x.id);
 assert.deepEqual(await teachers('sq'),[]);
 assert.deepEqual(await teachers(turco),[]);
 assert.equal((await call('/api/teachers')).status,400);
 assert.equal((await rpc('ipoly_maestros',{})).data.result.isError,true);
 const shqipTeacher=uid();
 assert.equal((await call('/api/teachers','POST',{id:shqipTeacher,name:'Maestra de Shqip',languageId:'sq',languages:['Shqip Geg','Inglés']})).status,201);
 const edit={id:shqipTeacher,requestId:uid(),expectedVersion:1,name:'Maestra de Shqip',languageId:'sq'};
 const edited=await call('/api/teachers','PATCH',edit);
 assert.equal(edited.status,200);
 assert.deepEqual((await call('/api/teachers','PATCH',edit)).data,edited.data);
 assert.deepEqual(edited.data.teacher.languages,['Shqip Geg','Inglés']);
 assert.deepEqual(await teachers('sq'),[shqipTeacher]);
 assert.equal((await call('/api/teachers','PATCH',{...edit,id:legacy,requestId:uid()})).status,404);
 assert.equal((await call('/api/teachers','PATCH',{...edit,requestId:uid(),expectedVersion:2,languageId:turco})).status,409);
 const turcoTeacher=uid();
 assert.equal((await call('/api/teachers','POST',{id:turcoTeacher,name:'Maestra anterior',languageId:turco})).status,201);
 assert.deepEqual(await teachers(turco),[turcoTeacher]);
 assert.deepEqual((await run('ipoly_maestros',{language:'sq'})).teachers.map(x=>x.id),[shqipTeacher]);
 assert.deepEqual((await run('ipoly_maestros',{language:turco})).teachers.map(x=>x.id),[turcoTeacher]);
 assert.deepEqual((await rpc('ipoly_maestros',{language:turco},B)).data.result.content.map(x=>JSON.parse(x.text).teachers),[[]]);
 assert.equal((await call('/api/teachers','POST',{id:uid(),name:'Ajeno',languageId:turco},B)).status,400);
 const draft={id:uid(),noteId:turcoNote,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'addition',text:'Aporte de prueba',author:{role:'tutor',id:shqipTeacher},recordedBy:{role:'user'}};
 assert.equal((await rpc('ipoly_proponer_aportacion',draft)).data.result.isError,true);
 const p=await run('ipoly_proponer_aportacion',{...draft,author:{role:'tutor',id:turcoTeacher}});
 await run('ipoly_aplicar_aportacion',{id:p.id,proposalVersion:p.proposalVersion,contentHash:p.contentHash,approvedContent:p.content,confirmed:true});
 assert.equal((await run('ipoly_memoria',{id:turcoNote})).entries.find(e=>e.source.id===p.id).author.id,turcoTeacher);
 assert.equal((await db.prepare('SELECT count(*) n FROM memory_classes').first()).n,0);
 assert.deepEqual(await run('ipoly_memoria',{id:sq}),before);
 console.log('Language-specific teacher creation, scoped editing, Chat, owner isolation and immutable prior history verified.');
}finally{await mf.dispose();}
