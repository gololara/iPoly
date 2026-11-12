import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import './local-evidence.mjs';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const blocked=[];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),host:'127.0.0.1',port:8788,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:request=>{blocked.push(new URL(request.url).origin);return new Response('External networking disabled in local smoke test',{status:502});}});
try{
 const db=await mf.getD1Database('DB');
 for(const name of(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
  const sql=await readFile('drizzle/'+name,'utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 }
 const url=await mf.ready;assert.equal(url.hostname,'127.0.0.1');
 const pinned=JSON.parse(await readFile(new URL('./fixtures/compatibility/migrations-v28.json',import.meta.url),'utf8'));
 for(const [file,sha] of Object.entries(pinned))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),sha);
 const headers={'oai-authenticated-user-id':'qa-independent-local','oai-authenticated-user-email':'independent@example.test'};
 const setup=await fetch(new URL('/api/languages',url),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'Shqip'})});assert.equal(setup.status,201);
 const page=await fetch(url,{headers});assert.equal(page.status,200);assert.equal(new URL(page.url).pathname,'/memorias');assert.match(await page.text(),/iPoly/);
 const noteId=crypto.randomUUID(),call=(pathname,options={})=>fetch(new URL(pathname,url),{...options,headers:{...headers,'Content-Type':'application/json'}});
 const write=await call('/api/notes',{method:'POST',body:JSON.stringify({id:noteId,language:'sq',original:'Synthetic first capture'})});
 assert.equal(write.status,201);
 const memory=await (await call('/api/memories/'+noteId)).json();
 assert.equal(memory.memory.note.original,'Synthetic first capture');
 const teachers=await call('/maestros?language=sq');assert.equal(teachers.status,200);
 const teacherHtml=await teachers.text();assert.match(teacherHtml,/Agregar maestro/);assert.doesNotMatch(teacherHtml,/Clases e historial|Accesos anteriores/);
 assert.equal((await call('/clases')).status,404);
 for(const removed of ['/api/classes','/api/preparations','/api/debriefs','/api/legacy-teacher-access']){
  assert.equal((await call(removed)).status,404);
  assert.equal((await call(removed,{method:'POST',body:'{}'})).status,404);
 }
 const rpc=await call('/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 assert.equal(rpc.status,200);
 const names=(await rpc.json()).result.tools.map(t=>t.name);
 assert.ok(names.includes('ipoly_memoria')&&names.includes('ipoly_maestros'));
 assert.ok(!names.some(n=>/preparacion|cierre|atribucion|debriefing/.test(n)));
 assert.equal(blocked.length,0,'Application unexpectedly attempted external networking');
 const report={http_page:200,primaryEntry:'Memorias',teachersPage:200,retiredRoutes:404,mcp_tools:200,ephemeral_d1:true,ephemeral_r2:true,external_network_blocked:true,external_requests:0,production_data_loaded:false,browser_test:false};
 await writeFile('.sites-runtime/evidence/local-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await mf.dispose();}
