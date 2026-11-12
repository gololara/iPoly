import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {registerHooks} from 'node:module';
import {Miniflare} from 'miniflare';
import './local-evidence.mjs';

const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},
  ...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js')
    .map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',
  compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],
  d1Persist:false,r2Persist:false,outboundService:()=>new Response('Blocked',{status:502})});
const checks=[],at='2026-01-01T00:00:00.000Z';
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}}
const approval=p=>({id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true,approvedContent:p.content});
async function api(owner,path,method='GET',body){
  const r=await mf.dispatchFetch('http://localhost'+path,{method,
    headers:{'Content-Type':'application/json','oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:await r.json()};
}
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())
  await db.batch((await readFile('drizzle/'+name,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const fixture=async(media=false)=>{
  const owner='synthetic-ledger-'+randomUUID(),noteId=randomUUID();
  await db.prepare('INSERT INTO notes(id,owner,language,original,created_at,updated_at,request_hash) VALUES(?,?,?,?,?,?,?)')
   .bind(noteId,owner,'en','Synthetic immutable original',at,at,noteId).run();
  const attachments=[];
  if(media){const id=randomUUID(),bytes=await readFile('public/icon-192.png');await bucket.put('review/'+id,bytes);
   await db.prepare("INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at) VALUES(?,?,?,?,1,'image/png',?,'personal',?)")
    .bind(id,owner,noteId,'review/'+id,bytes.length,at).run();attachments.push({attachmentId:id});}
  const draft={id:randomUUID(),noteId,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'addition',
   text:'Synthetic exact approved text',context:'Synthetic context',author:{role:'ai',name:'Synthetic AI'},recordedBy:{role:'user'},attachments};
  const proposed=await api(owner,'/api/memory-proposals','POST',draft);assert.equal(proposed.status,201);
  const p=proposed.body.proposal;const applied=await api(owner,'/api/memory-approval','POST',approval(p));assert.equal(applied.status,200);
  return {owner,noteId,draft,p};
 };
 await check('missing applied contribution blocks a fresh proposal',async()=>{
  const f=await fixture();await db.prepare('DELETE FROM memory_contributions WHERE id=?').bind(f.p.id).run();
  assert.equal((await api(f.owner,'/api/memory-proposals','POST',{...f.draft,id:randomUUID(),expectedMemoryVersion:1})).status,409);
 });
 await check('altered applied text is rejected by detail instead of presented as approved',async()=>{
  const f=await fixture();await db.prepare('UPDATE memory_contributions SET text=? WHERE id=?').bind('Corrupt recovery text',f.p.id).run();
  assert.equal((await api(f.owner,'/api/memories/'+f.noteId)).status,409);
 });
 await check('list and detail both reject a lost approval head',async()=>{
  const f=await fixture();await db.prepare('DELETE FROM memory_heads WHERE note_id=?').bind(f.noteId).run();
  assert.equal((await api(f.owner,'/api/memories/'+f.noteId)).status,409);
  assert.equal((await api(f.owner,'/api/memories?language=en&q=no-match')).status,409);
 });
 await check('missing historical media relationship rejects detail',async()=>{
  const f=await fixture(true);await db.prepare('DELETE FROM memory_contribution_attachments WHERE contribution_id=?').bind(f.p.id).run();
  assert.equal((await api(f.owner,'/api/memories/'+f.noteId)).status,409);
 });
 await check('changed author metadata is rejected before another write',async()=>{
  const f=await fixture();await db.prepare('UPDATE memory_contributions SET author_name=? WHERE id=?').bind('Altered recorded author',f.p.id).run();
  assert.equal((await api(f.owner,'/api/memory-proposals','POST',{...f.draft,id:randomUUID(),expectedMemoryVersion:1})).status,409);
 });
 await check('current file revocation preserves historical replay without restoring file access',async()=>{
  const f=await fixture(true);await db.prepare('UPDATE attachments SET included=0 WHERE id=?').bind(f.draft.attachments[0].attachmentId).run();
  assert.equal((await api(f.owner,'/api/memory-approval','POST',approval(f.p))).status,200);
  const m=await api(f.owner,'/api/memories/'+f.noteId);assert.equal(m.status,200);
  assert.equal(m.body.memory.entries.find(e=>e.source.id===f.p.id).attachments.length,0);
  const r=await mf.dispatchFetch('http://localhost/api/files/'+f.draft.attachments[0].attachmentId,
   {headers:{'oai-authenticated-user-id':f.owner,'oai-authenticated-user-email':f.owner+'@example.test'}});assert.equal(r.status,404);
 });
 await check('phase-one entries without writer proposals remain compatible',async()=>{
  const owner='synthetic-phase1-'+randomUUID(),noteId=randomUUID(),legacyId=randomUUID();
  await db.prepare('INSERT INTO notes(id,owner,language,original,created_at,updated_at,request_hash) VALUES(?,?,?,?,?,?,?)')
   .bind(noteId,owner,'en','Synthetic legacy capture',at,at,noteId).run();
  await db.prepare("INSERT INTO memory_contributions(id,owner,note_id,kind,text,context,author_role,state,approved_by,created_at,applied_at) VALUES(?,?,?,'addition',?,'','unknown','applied',?,?,?)")
   .bind(legacyId,owner,noteId,'Synthetic phase-one entry',owner,at,at).run();
  const m=await api(owner,'/api/memories/'+noteId);assert.equal(m.status,200);assert.equal(m.body.memory.contributionVersion,0);
  const p=await api(owner,'/api/memory-proposals','POST',{id:randomUUID(),noteId,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'addition',text:'Synthetic later approved entry',author:{role:'user'}});
  assert.equal(p.status,201);assert.equal((await api(owner,'/api/memory-approval','POST',approval(p.body.proposal))).status,200);
  assert.equal((await api(owner,'/api/memories/'+noteId)).body.memory.entries.filter(e=>e.source.system==='contribution').length,2);
 });
 await check('logical correction and code rollback preserve applied entries and original',async()=>{
  const f=await fixture(),before=(await api(f.owner,'/api/memories/'+f.noteId)).body.memory;
  const p=await api(f.owner,'/api/memory-proposals','POST',{...f.draft,id:randomUUID(),expectedMemoryVersion:1,kind:'correction',text:'Synthetic reviewed correction'});
  assert.equal(p.status,201);assert.equal((await api(f.owner,'/api/memory-approval','POST',approval(p.body.proposal))).status,200);
  const after=(await api(f.owner,'/api/memories/'+f.noteId)).body.memory;assert.deepEqual(after.note,before.note);
  assert.equal(after.entries.filter(e=>e.source.system==='contribution').length,2);assert.equal(after.contributionVersion,2);
  globalThis.__memoryRollbackEnv={DB:db,BUCKET:bucket};
  registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__memoryRollbackEnv;',shortCircuit:true};return next(specifier,context);}});
  const {readMemory}=await import('./fixtures/compatibility/v20-memory-reader.mjs');
  const tableNames=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(r=>r.name);
  const dump=async()=>Object.fromEntries(await Promise.all(tableNames.map(async t=>[t,(await db.prepare('SELECT * FROM "'+t+'"').all()).results.map(r=>JSON.stringify(r)).sort()])));
  const saved=await dump(),old=await readMemory(f.owner,f.noteId);
  assert.deepEqual(old.note,after.note);assert.equal(old.entries.filter(e=>e.source.system==='contribution').length,2);
  assert.equal(old.entries.find(e=>e.source.id===f.p.id).text,f.p.content.text);
  assert.deepEqual(await dump(),saved);
 });
 const report={base:'2321ab88ed4792f217b02cb51aedb357590a1ba8',syntheticOnly:true,production:false,
  passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks};
 await writeFile('.sites-runtime/evidence/memory-ledger-review'+(process.argv.includes('--baseline')?'-baseline':'')+'.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));assert.equal(report.failed,0);
} finally {await mf.dispose();}
