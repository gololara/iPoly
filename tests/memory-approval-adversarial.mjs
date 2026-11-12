import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {registerHooks} from 'node:module';
import {z} from 'zod';
import './local-evidence.mjs';
// The actual source service uses a timing adapter over real ephemeral D1. The
// adapter pauses before a real SQL transaction, never simulates its result.
globalThis.__approvalReviewUuid=z.string().uuid();
const binding='data:text/javascript,'+encodeURIComponent(`
 export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
 export const uuid=globalThis.__approvalReviewUuid;
 export const database=()=>globalThis.__approvalReviewDb;
 export async function requireConfiguredLanguage(){throw new Error('Teacher profile creation is outside this test fixture');}
 export async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
`);
const parents=['memory-write.ts','memory-contract.ts','teachers.ts'].map(n=>new URL('../lib/'+n,import.meta.url).href);
registerHooks({resolve(specifier,context,next){if(specifier==='./data'&&parents.includes(context.parentURL))return {url:binding,shortCircuit:true};return next(specifier,context);}});
const {proposeMemoryContribution:propose,applyMemoryContribution:apply,cancelMemoryContribution:cancel,readMemoryProposal:read}=await import('../lib/memory-write.ts');
const {proposeMemorySchema}=await import('../lib/memory-contract.ts');
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:()=>new Response('Blocked',{status:502})});
const A='adversarial-owner-a',B='adversarial-owner-b',at='2026-01-01T00:00:00.000Z',id=()=>crypto.randomUUID(),checks=[];
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}}
const args=p=>({id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true,approvedContent:structuredClone(p.content)});
const decision=p=>({id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true});
const denied=(f,status=409)=>assert.rejects(f,e=>status==='parse'?Array.isArray(e.issues):e.status===status);
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET'),image=await readFile('public/icon-192.png');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const adapter={beforeBatch:null,beforeRun:null,barrier:null,loseResponse:false,
  prepare(sql){const wrap=raw=>({raw,bind(...v){return wrap(raw.bind(...v));},first(...v){return raw.first(...v);},all(...v){return raw.all(...v);},async run(){if(adapter.beforeRun&&/^(INSERT INTO memory_proposals|UPDATE memory_proposals)/.test(sql)){const cb=adapter.beforeRun;adapter.beforeRun=null;await cb();}return raw.run();}});return wrap(db.prepare(sql));},
  async batch(statements){if(adapter.beforeBatch){const cb=adapter.beforeBatch;adapter.beforeBatch=null;await cb();}if(adapter.barrier)await adapter.barrier();const r=await db.batch(statements.map(s=>s.raw));if(adapter.loseResponse){adapter.loseResponse=false;throw Error('SYNTHETIC_COMMITTED_RESPONSE_LOST');}return r;}
 };globalThis.__approvalReviewDb=adapter;
 const fixture=async()=>{
  const noteId=id(),teacherId=id(),attachmentId=id(),classId=id();
  await db.prepare('INSERT INTO notes(id,owner,language,original,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(noteId,A,'en','Synthetic original',noteId,at,at).run();
  await db.prepare('INSERT INTO teachers(id,owner,name,languages,request_hash,created_at,updated_at,language_id) VALUES(?,?,?,?,?,?,?,?)').bind(teacherId,A,'Synthetic teacher','[]',teacherId,at,at,'en').run();
  await bucket.put('review/'+attachmentId,image);await db.prepare("INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at) VALUES(?,?,?,?,1,'image/png',?,'personal',?)").bind(attachmentId,A,noteId,'review/'+attachmentId,image.length,at).run();
  await db.prepare("INSERT INTO tutor_records(id,owner,kind,state,data,request_hash,created_at,applied_at) VALUES(?,?,'preparation','applied',?,?,?,?)").bind(classId,A,JSON.stringify({language:'en',references:[{noteId,expectedVersion:1}]}),classId,at,at).run();
  const input={id:id(),noteId,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'correction',text:'Exact synthetic review',author:{role:'tutor',id:teacherId},classId,attachments:[{attachmentId}]};
  return {noteId,teacherId,attachmentId,classId,input};
 };
 const empty=async f=>{assert.equal(await db.prepare('SELECT id FROM memory_contributions WHERE note_id=?').bind(f.noteId).first(),null);assert.equal(await db.prepare('SELECT note_id FROM memory_heads WHERE note_id=?').bind(f.noteId).first(),null);};
 const toolRpc=await mf.dispatchFetch('http://localhost/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});const tools=(await toolRpc.json()).result.tools;
 for(const name of ['ipoly_aplicar_aportacion','ipoly_cancelar_aportacion'])await check(name+' declares confirmation and destructive lifecycle',()=>{const t=tools.find(t=>t.name===name);assert.equal(t.inputSchema.properties.confirmed.const,true);assert(t.inputSchema.required.includes('confirmed'));assert.equal(t.annotations.readOnlyHint,false);assert.equal(t.annotations.destructiveHint,true);});
 await check('proposal is additive and cannot implicitly apply',async()=>{const f=await fixture(),p=await propose(A,f.input);assert.equal(p.state,'proposed');await empty(f);});
 await check('approval requires every canonical field, without inserting defaults',async()=>{const f=await fixture(),p=await propose(A,f.input),a=args(p);delete a.approvedContent.context;await denied(()=>apply(A,a),'parse');await empty(f);});
 await check('unsafe counter versions are rejected by schema',()=>assert.equal(proposeMemorySchema.safeParse({id:id(),noteId:id(),expectedNoteVersion:1,expectedMemoryVersion:2**53,kind:'addition',text:'Synthetic',author:{role:'ai'}}).success,false));
 await check('unsafe seeded counter cannot produce a non-incrementing approval',async()=>{const f=await fixture();await db.prepare('INSERT INTO memory_heads(note_id,owner,version) VALUES(?,?,?)').bind(f.noteId,A,2**53).run();await denied(()=>propose(A,{...f.input,expectedMemoryVersion:2**53}),'parse');assert.equal(await db.prepare('SELECT id FROM memory_contributions WHERE note_id=?').bind(f.noteId).first(),null);});
 await check('read detects mismatched immutable content/hash',async()=>{const f=await fixture(),p=await propose(A,f.input),c={...p.content,text:'Tampered stored content'};await db.prepare('UPDATE memory_proposals SET content=? WHERE id=?').bind(JSON.stringify(c),p.id).run();await denied(()=>read(A,p.id));});
 await check('successful replay checks the applied content, not merely its ID',async()=>{const f=await fixture(),p=await propose(A,f.input);await apply(A,args(p));await db.prepare('UPDATE memory_contributions SET text=? WHERE id=?').bind('Tampered applied content',p.id).run();await denied(()=>apply(A,args(p)));});
 await check('successful replay checks complete attachment attribution',async()=>{const f=await fixture(),p=await propose(A,f.input);await apply(A,args(p));await db.prepare('DELETE FROM memory_contribution_attachments WHERE contribution_id=?').bind(p.id).run();await denied(()=>apply(A,args(p)));});
 const mutations=[
  ['note ownership',f=>db.prepare('UPDATE notes SET owner=? WHERE id=?').bind(B,f.noteId).run()],
  ['tutor ownership',f=>db.prepare('UPDATE teachers SET owner=? WHERE id=?').bind(B,f.teacherId).run()],
  ['tutor revision',f=>db.prepare('UPDATE teachers SET version=version+1 WHERE id=?').bind(f.teacherId).run()],
  ['attachment ownership',f=>db.prepare('UPDATE attachments SET owner=? WHERE id=?').bind(B,f.attachmentId).run()],
  ['attachment inclusion',f=>db.prepare('UPDATE attachments SET included=0 WHERE id=?').bind(f.attachmentId).run()],
  ['attachment content hash',f=>db.prepare('UPDATE attachments SET content_hash=? WHERE id=?').bind('changed-synthetic-hash',f.attachmentId).run()],
  ['class ownership',f=>db.prepare('UPDATE tutor_records SET owner=? WHERE id=?').bind(B,f.classId).run()],
  ['class membership',f=>db.prepare('UPDATE tutor_records SET data=? WHERE id=?').bind(JSON.stringify({language:'en',references:[]}),f.classId).run()]
 ];
 for(const [name,mutate]of mutations)await check('TOCTOU '+name+' revoked after check, before real transaction',async()=>{const f=await fixture(),p=await propose(A,f.input);adapter.beforeBatch=()=>mutate(f);await denied(()=>apply(A,args(p)));await empty(f);});
 await check('TOCTOU proposal immutable columns cannot drift before approval',async()=>{const f=await fixture(),p=await propose(A,f.input);adapter.beforeBatch=()=>db.prepare('UPDATE memory_proposals SET expected_memory_version=1 WHERE id=?').bind(p.id).run();await denied(()=>apply(A,args(p)));await empty(f);});
 await check('TOCTOU cancellation never cancels a different corrupted review body',async()=>{const f=await fixture(),p=await propose(A,f.input);adapter.beforeRun=()=>db.prepare('UPDATE memory_proposals SET content=? WHERE id=?').bind(JSON.stringify({...p.content,text:'Changed during cancellation'}),p.id).run();await denied(()=>cancel(A,decision(p)));assert.equal((await db.prepare('SELECT state FROM memory_proposals WHERE id=?').bind(p.id).first()).state,'proposed');});
 await check('TOCTOU revoked media during proposal creation inserts no proposal',async()=>{const f=await fixture();adapter.beforeRun=()=>db.prepare('UPDATE attachments SET included=0 WHERE id=?').bind(f.attachmentId).run();await denied(()=>propose(A,f.input));assert.equal(await db.prepare('SELECT id FROM memory_proposals WHERE id=?').bind(f.input.id).first(),null);await empty(f);});
 await check('cancellation after apply precheck wins before its SQL transaction',async()=>{const f=await fixture(),p=await propose(A,f.input);adapter.beforeBatch=()=>cancel(A,decision(p));await denied(()=>apply(A,args(p)));assert.equal((await read(A,p.id)).state,'cancelled');await empty(f);});
 await check('uncertain response after commit is recovered exactly once',async()=>{const f=await fixture(),p=await propose(A,f.input);adapter.loseResponse=true;const a=await apply(A,args(p));assert.equal(a.state,'applied');assert.deepEqual(await apply(A,args(p)),a);assert.equal((await db.prepare('SELECT version FROM memory_heads WHERE note_id=?').bind(f.noteId).first()).version,1);assert.equal((await db.prepare('SELECT count(*) total FROM memory_contributions WHERE note_id=?').bind(f.noteId).first()).total,1);});
 await check('barrier releases two real concurrent approval transactions',async()=>{const f=await fixture(),p=await propose(A,f.input),p2=await propose(A,{...f.input,id:id(),text:'Second exact review'});let arrive=0,release;const gate=new Promise(r=>release=r);adapter.barrier=async()=>{if(++arrive===2)release();await gate;};const results=await Promise.allSettled([apply(A,args(p)),apply(A,args(p2))]);adapter.barrier=null;assert.equal(arrive,2);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal((await db.prepare('SELECT version FROM memory_heads WHERE note_id=?').bind(f.noteId).first()).version,1);});
 await check('lost approval head blocks a fresh write instead of resetting history',async()=>{const f=await fixture(),p=await propose(A,f.input);await apply(A,args(p));await db.prepare('DELETE FROM memory_heads WHERE note_id=?').bind(f.noteId).run();await denied(()=>propose(A,{...f.input,id:id()}));await denied(()=>apply(A,args(p)));const r=await mf.dispatchFetch('http://localhost/api/memories/'+f.noteId,{headers:{'oai-authenticated-user-id':A,'oai-authenticated-user-email':A+'@example.test'}});assert.equal(r.status,409);assert.equal((await db.prepare('SELECT count(*) total FROM memory_contributions WHERE note_id=?').bind(f.noteId).first()).total,1);});
 await check('inflated approval head is not accepted as a new review version',async()=>{const f=await fixture(),p=await propose(A,f.input);await apply(A,args(p));await db.prepare('UPDATE memory_heads SET version=2 WHERE note_id=?').bind(f.noteId).run();await denied(()=>propose(A,{...f.input,id:id(),expectedMemoryVersion:2}));assert.equal((await db.prepare('SELECT count(*) total FROM memory_contributions WHERE note_id=?').bind(f.noteId).first()).total,1);});
 await check('applied media order matches the exact approved array',async()=>{const f=await fixture(),second=id();await bucket.put('review/'+second,image);await db.prepare("INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at) VALUES(?,?,?,?,1,'image/png',?,'personal',?)").bind(second,A,f.noteId,'review/'+second,image.length,'2026-01-02T00:00:00.000Z').run();const p=await propose(A,{...f.input,attachments:[{attachmentId:second},{attachmentId:f.attachmentId}]});await apply(A,args(p));const r=await mf.dispatchFetch('http://localhost/api/memories/'+f.noteId,{headers:{'oai-authenticated-user-id':A,'oai-authenticated-user-email':A+'@example.test'}});assert.equal(r.status,200);const m=(await r.json()).memory;assert.deepEqual(m.entries.find(e=>e.source.id===p.id).attachments.map(a=>a.id),[second,f.attachmentId]);});
 await check('applied history replay never grants revoked file access again',async()=>{const f=await fixture(),p=await propose(A,f.input);const applied=await apply(A,args(p));await db.prepare('UPDATE attachments SET included=0 WHERE id=?').bind(f.attachmentId).run();assert.deepEqual(await apply(A,args(p)),applied);await denied(()=>propose(A,{...f.input,id:id(),expectedMemoryVersion:1}),403);const r=await mf.dispatchFetch('http://localhost/api/files/'+f.attachmentId,{headers:{'oai-authenticated-user-id':A,'oai-authenticated-user-email':A+'@example.test'}});assert.equal(r.status,404);});
 const report={base:'ce981c25f7a63b8a47afb43d8d41e7d43a2837eb',realD1:true,syntheticOnly:true,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks};
 await writeFile('.sites-runtime/evidence/memory-approval-adversarial'+(process.argv.includes('--baseline')?'-baseline':'')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));assert.equal(report.failed,0);
}finally{await mf.dispose();}
