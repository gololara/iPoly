import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readdir,readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {seedMemoryDetail,fixtureHeaders} from '../scripts/memory-detail-fixture.mjs';
import './local-evidence.mjs';
const bundle=resolve('.sites-runtime/evidence/class-history-view.cjs');
await build({entryPoints:['components/class-history.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/*','react-dom','react-dom/*'],outfile:bundle,logLevel:'error'});
const {HistoricalClassRecord}=createRequire(import.meta.url)(bundle);
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
let external=0,checks=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;},ok=(value,message)=>{assert.ok(value,message);checks++;};
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},assetConfig:{html_handling:'none',not_found_handling:'none'}},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false,outboundService:()=>{external++;return new Response('Blocked',{status:502});}});
const uid=()=>crypto.randomUUID(),at='2026-01-01T00:00:00Z';
const request=(path,body,headers=fixtureHeaders)=>mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},redirect:'manual',...(body?{body:JSON.stringify(body)}:{})});
async function api(path,body,status=200,headers=fixtureHeaders){const r=await request('/api/'+path,body,headers),d=await r.json();eq(r.status,status,JSON.stringify(d));return d;}
const rpc=async(name,args={})=>{const r=await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}),d=await r.json();ok(!d.result?.isError,'MCP read succeeds');return JSON.parse(d.result.content[0].text);};
try{
 const f=await seedMemoryDetail(mf),db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 const ids=[f.rich,f.empty,f.unknown];
 for(let i=0;i<8;i++){const id=uid();await api('notes',{id,language:'sq',original:'Synthetic unplanned memory '+i},201);ids.push(id);}
 const snapshots=await Promise.all(ids.map(async id=>(await api('notes/'+id)).note));
 const pOld=uid(),pCurrent=uid(),pPending=uid(),thread=uid(),closing=uid();
 const data={language:'sq',title:'Synthetic preparation',summary:'Context for the teacher; not evidence of work',references:snapshots.slice(0,7).map(n=>({noteId:n.id,expectedVersion:n.version,snapshot:n}))};
 for(const [id,state,title]of [[pOld,'applied','Prior revision'],[pCurrent,'applied','Current revision'],[pPending,'proposed','Unapplied preparation']])await db.prepare('INSERT INTO tutor_records(id,owner,kind,state,data,request_hash,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,f.owner,'preparation',state,JSON.stringify({...data,title}),id,at,state==='applied'?at:null).run();
 await db.prepare('INSERT INTO tutor_threads(id,owner,language,current_preparation_id,version,request_hash,created_at) VALUES(?,?,?,?,1,?,?)').bind(thread,f.owner,'sq',pCurrent,thread,at).run();
 for(const p of[pOld,pCurrent])await db.prepare('INSERT INTO tutor_thread_members(preparation_id,thread_id,owner,created_at) VALUES(?,?,?,?)').bind(p,thread,f.owner,at).run();
 await db.prepare('INSERT INTO tutor_records(id,owner,kind,parent_id,state,data,request_hash,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(closing,f.owner,'closing',pCurrent,'applied',JSON.stringify({...data,reported:'Synthetic teacher report across several memories',practice:'Historical review material',changes:[]}),closing,at,at).run();
 const pendingDebrief=(await api('debriefs',{id:uid(),summary:'Synthetic pending review',changes:[{noteId:f.empty,expectedVersion:1,clarified:'Unapproved text',tags:[]}]},201)).debrief;
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results.map(r=>r.name);
 const dump=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.prepare('SELECT * FROM "'+t+'"').all()).results.map(r=>JSON.stringify(r)).sort()])));
 const before=await dump(),mediaBefore=Buffer.from(await(await bucket.get('synthetic-detail/'+f.photo)).arrayBuffer());
 for(const [old,target]of [['/','/memorias'],['/?view=today','/memorias?history=no_debrief'],['/?view=memory&language=en','/memorias?language=en'],['/?view=debrief','/memorias?archive=debriefs'],['/?view=tutor&preparation='+pOld,'/clases?preparation='+pOld],['/?view=tutor&preparation='+pPending,'/clases?preparation='+pPending]]){
  const response=await request(old);ok([301,302,303,307,308].includes(response.status),'legacy URL redirects');eq(response.headers.get('location'),target);
 }
 for(const path of ['/memorias','/memorias?archive=debriefs','/clases?preparation='+pOld,'/clases?preparation='+pPending,'/clases?class='+thread]){const r=await request(path),html=await r.text();eq(r.status,200);ok(!html.includes('Copiar inicio'),'no chat-transfer screen');}
 const anonymous=await request('/clases?preparation='+pOld,undefined,{});ok(anonymous.status>=300&&anonymous.status<400&&anonymous.headers.get('location')?.includes('signin-with-chatgpt'),'new historical route retains sign-in');
 const oldHistory=await api('preparations/'+pOld),currentHistory=await api('preparations/'+pCurrent),pending=await api('preparations/'+pPending);
 eq(oldHistory.preparation.id,pOld);eq(oldHistory.thread.id,thread);eq(oldHistory.history.length,2);eq(currentHistory.closings[0].id,closing);eq(pending.preparation.state,'proposed');
 const html=renderToStaticMarkup(React.createElement(HistoricalClassRecord,{record:currentHistory.closings[0]}));
 ok(html.includes('Synthetic teacher report across several memories')&&html.includes('Historical review material'),'global closing context retained without assigning it to a memory');
 for(const n of snapshots.slice(0,7))ok(html.includes('/memorias/'+n.id),'same original memory IDs linked');
 const pendingHtml=renderToStaticMarkup(React.createElement(HistoricalClassRecord,{record:pending.preparation}));ok(pendingHtml.includes('Propuesta pendiente')&&!pendingHtml.includes('Confirmar preparación anterior')&&pendingHtml.includes('Solo consulta'),'pending proposal remains visible without approval action');
 const historicalHtml=renderToStaticMarkup(React.createElement(HistoricalClassRecord,{record:{...oldHistory.preparation,state:'proposed'},canApply:false}));ok(!historicalHtml.includes('Confirmar preparación anterior')&&historicalHtml.includes('Solo consulta'),'historical revision cannot be applied in UI');
 const unsafe=structuredClone(pending.preparation);unsafe.data.summary='<script>untrusted()</script>';ok(!renderToStaticMarkup(React.createElement(HistoricalClassRecord,{record:unsafe})).includes('<script>untrusted()'),'stored source text is escaped');
 eq((await api('debriefs')).debriefs.find(d=>d.id===pendingDebrief.id).state,'proposed');
 const memory=await rpc('ipoly_memoria',{id:f.rich});eq(memory.note.id,f.rich);ok(memory.entries.some(e=>e.author.role==='ai')&&memory.entries.some(e=>e.author.role==='tutor'),'existing attributed contributions stay readable');
 const initialize=await(await request('/mcp',{jsonrpc:'2.0',id:2,method:'initialize'})).json();ok(initialize.result.instructions.includes('ipoly_memoria')&&initialize.result.instructions.includes('marcar individualmente'),'primary MCP instructions use new model and individual work');
 const state=await rpc('ipoly_estado');eq(state.memory.readTool,'ipoly_memoria');eq(state.memory.classes,'/clases');for(const path of ['preparations','preparations/group','tutor/apply','closings','class-contribution','class-session-note','class-session-closing','teacher-sharing-preview','teacher-sharing-confirm','teacher-sharing-retry','material-preview','material-publish','material-retry'])await api(path,{},410);
 for(const path of ['teacher-copy','material-selection','class-teacher','class-details']){
  const r=await mf.dispatchFetch('http://localhost/api/'+path,{method:'PATCH',headers:{...fixtureHeaders,'Content-Type':'application/json'},body:'{}'});
  eq(r.status,410);
 }
 for(const name of ['ipoly_proponer_preparacion','ipoly_proponer_cierre','ipoly_aplicar_propuesta_tutor']){
  const r=await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{id:pPending,confirmed:true}}});
  ok((await r.json()).result.isError,'cached writer refuses to mutate '+name);
 }
 eq((await dump()),before,'all history/route/MCP reads and blocked writes leave all existing tables exact');eq(Buffer.from(await(await bucket.get('synthetic-detail/'+f.photo)).arrayBuffer()),mediaBefore,'original R2 bytes unchanged');
 await api('preparations/'+pOld,undefined,404,{'oai-authenticated-user-id':'foreign-synthetic-owner','oai-authenticated-user-email':'foreign@example.test'});
 let c=await api('classes/'+thread);eq(c.memories.length,7);eq(c.memories.filter(n=>n.reviewed).length,0,'preparation does not imply class work');
 for(const id of ids.slice(0,2)){const n=c.memories.find(n=>n.noteId===id);c=await api('class-memory-reviewed',{classId:c.id,expectedVersion:c.version,requestId:uid(),noteId:id,expectedNoteVersion:n.noteVersion,reviewed:true});}
 eq(c.memories.filter(n=>n.reviewed).length,2);c=await api('class-memories',{classId:c.id,expectedVersion:c.version,requestId:uid(),memories:snapshots.slice(7).map(n=>({noteId:n.id,expectedVersion:n.version}))});eq(c.memories.length,11);eq(c.memories.filter(n=>n.reviewed).length,2);
 const n=snapshots[7],proposal=(await api('memory-proposals',{id:uid(),noteId:n.id,expectedNoteVersion:n.version,expectedMemoryVersion:0,kind:'addition',text:'Synthetic teacher explanation recorded by user',author:{role:'tutor',id:f.teacher},recordedBy:{role:'user'},classId:thread},201)).proposal;
 await api('memory-approval',{id:proposal.id,proposalVersion:proposal.proposalVersion,contentHash:proposal.contentHash,approvedContent:proposal.content,confirmed:true});
 c=await api('classes/'+thread);eq(c.memories.filter(n=>n.reviewed).length,2,'recording an explanation does not mark the preparation worked');eq((await api('notes/'+n.id)).note,n,'new contribution preserves legacy note');eq((await api('preparations/'+pOld)).preparation,oldHistory.preparation,'historical preparation unchanged');
 for(const path of ['app/workspace.tsx','components/tutor-workspace.tsx','components/class-session.tsx','components/material-preview.tsx'])await assert.rejects(access(path));checks+=4;
 // Session membership/lifecycle guards are now explicitly authorized. Their
 // preservation and races are exercised by the class-cycle integration tests;
 // the migrations, original memory writer and preparation contract stay frozen.
 const publishedMigrations=JSON.parse(await readFile(new URL('./fixtures/compatibility/migrations-v28.json',import.meta.url),'utf8'));
 for(const [file,checksum] of Object.entries(publishedMigrations)){
  eq(createHash('sha256').update(await readFile(file)).digest('hex'),checksum,'published migration bytes: '+file);
 }
 eq(external,0);
 const report={passed:checks,syntheticOnly:true,production:false,allReadTablesPreserved:tables.length,oldURLsRedirect:true,historicalIdentitiesPreserved:true,pendingProposalsRetained:true,preparationNotClassWork:true,externalRequests:external};await writeFile('.sites-runtime/evidence/legacy-closure-integration.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await mf.dispose();}
