import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import './local-evidence.mjs';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,'+encodeURIComponent('export const env=globalThis.__attributionTestEnv;'),shortCircuit:true};return next(specifier,context);}});
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("Synthetic");}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],outboundService:()=>new Response('Blocked',{status:502})});
let hook=null,checks=0;const owner='synthetic-toctou-owner';
try{
 const db=await mf.getD1Database('DB');for(const f of(await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(x=>x.trim()).map(x=>db.prepare(x)));
 const wrap=stmt=>({bind(...args){return wrap(stmt.bind(...args));},all:stmt.all.bind(stmt),first:stmt.first.bind(stmt),async run(){if(hook){const h=hook;hook=null;await h();}return stmt.run();}});
 globalThis.__attributionTestEnv={DB:{prepare:sql=>sql.startsWith('UPDATE memory_attribution_corrections SET state=')?wrap(db.prepare(sql)):db.prepare(sql),batch:db.batch.bind(db)}};
 const bundle=resolve('.sites-runtime/evidence/attribution-write-test.mjs');await build({entryPoints:['lib/attribution-write.ts'],bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],outfile:bundle,logLevel:'error'});const {proposeAttribution,applyAttribution,cancelAttribution}=await import(pathToFileURL(bundle).href);
 const seed=async()=>{const noteId=crypto.randomUUID(),debriefId=crypto.randomUUID(),date='2026-01-01T12:00:00Z',text='Synthetic exact source';await db.prepare('INSERT INTO notes(id,owner,language,original,clarified,created_at,updated_at,version,request_hash) VALUES(?,?,?,?,?,?,?,2,?)').bind(noteId,owner,'en','Synthetic original',text,date,date,noteId).run();await db.prepare("INSERT INTO debriefs(id,owner,summary,changes,state,created_at,applied_at) VALUES(?,?,?,?,'applied',?,?)").bind(debriefId,owner,'Synthetic',JSON.stringify([{noteId,expectedVersion:1,clarified:text,tags:[]}]),date,date).run();const p=await proposeAttribution(owner,{id:crypto.randomUUID(),noteId,debriefId,expectedNoteVersion:2,previousCorrectionId:null,author:{role:'ai',id:null,name:null},evidence:{kind:'user_attestation',statement:'Synthetic confirmed authorship',reference:null}});return {noteId,debriefId,p};};
 for(const kind of ['owner','version','source-owner','source-text','source-state']){
  const {noteId,debriefId,p}=await seed();hook=async()=>{if(kind==='owner')await db.prepare('UPDATE notes SET owner=? WHERE id=?').bind('synthetic-foreign',noteId).run();if(kind==='version')await db.prepare('UPDATE notes SET version=3 WHERE id=?').bind(noteId).run();if(kind==='source-owner')await db.prepare('UPDATE debriefs SET owner=? WHERE id=?').bind('synthetic-foreign',debriefId).run();if(kind==='source-text')await db.prepare('UPDATE debriefs SET changes=? WHERE id=?').bind(JSON.stringify([{noteId,expectedVersion:1,clarified:'Changed after review'}]),debriefId).run();if(kind==='source-state')await db.prepare("UPDATE debriefs SET state='proposed' WHERE id=?").bind(debriefId).run();};
  await assert.rejects(applyAttribution(owner,{id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true,approvedContent:p.content}),e=>e.status===409);checks++;
  assert.equal((await db.prepare('SELECT state FROM memory_attribution_corrections WHERE id=?').bind(p.id).first()).state,'proposed');checks++;
 }
 const {p}=await seed();hook=async()=>{await db.prepare("UPDATE memory_attribution_corrections SET state='cancelled',cancelled_at=? WHERE id=?").bind(new Date().toISOString(),p.id).run();};await assert.rejects(applyAttribution(owner,{id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true,approvedContent:p.content}),e=>e.status===409);checks++;
 const q=(await seed()).p;hook=async()=>{await db.prepare("UPDATE memory_attribution_corrections SET state='applied',applied_at=?,approved_by=? WHERE id=?").bind(new Date().toISOString(),owner,q.id).run();};await assert.rejects(cancelAttribution(owner,{id:q.id,proposalVersion:1,contentHash:q.contentHash,confirmed:true}),e=>e.status===409);checks++;
 const report={passed:checks,realD1:true,deterministicMutationAfterReadBeforeWrite:true,production:false};await writeFile('.sites-runtime/evidence/attribution-toctou.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{hook=null;await mf.dispose();}
