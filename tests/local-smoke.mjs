import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
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
 for(const name of ['integration']){
  const child=spawn(process.execPath,['tests/'+name+'.mjs'],{stdio:'inherit',env:process.env});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0,name+' failed');
 }
 const headers={'oai-authenticated-user-id':'qa-independent-local','oai-authenticated-user-email':'independent@example.test'};
 const setup=await fetch(new URL('/api/languages',url),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'Shqip'})});assert.equal(setup.status,201);
 const page=await fetch(url,{headers});assert.equal(page.status,200);assert.equal(new URL(page.url).pathname,'/memorias');assert.match(await page.text(),/iPoly/);const classes=await fetch(new URL('/clases',url),{headers});assert.equal(classes.status,200);assert.match(await classes.text(),/Clases/);
 const rpc=await fetch(new URL('/mcp',url),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(rpc.status,200);assert.ok((await rpc.json()).result.tools.length>0);
 assert.equal(blocked.length,0,'Application unexpectedly attempted external networking');
 const report={http_page:200,primaryEntry:'Memorias',classesPage:200,mcp_tools:200,existing_api_integration:true,ephemeral_d1:true,ephemeral_r2:true,external_network_blocked:true,external_requests:0,production_data_loaded:false,browser_test:false};
 await writeFile('.sites-runtime/evidence/local-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await mf.dispose();}
