import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import './local-evidence.mjs';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:()=>new Response('Blocked',{status:502})});
const id=()=>crypto.randomUUID(),A='review-owner-a',B='review-owner-b',a=id(),b=id(),pending=id(),bad=id(),date='2026-01-01T00:00:00.000Z',checks=[];
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}}
async function call(note,owner=A,method='GET'){const r=await mf.dispatchFetch('http://localhost/api/memories/'+note,{method,headers:owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test'}:{}});return {status:r.status,body:await r.json()};}
try{
 const db=await mf.getD1Database('DB');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 for(const [note,owner]of [[a,A],[b,B],[pending,A],[bad,A]])await db.prepare('INSERT INTO notes(id,owner,language,original,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(note,owner,'en','Synthetic original',note,date,date).run();
 const prep=id(),foreignPrep=id(),closing=id(),sourceClosing=id(),parentClosing=id(),proposedClosing=id();
 const record=async(recordId,owner,kind,parent,data,state='applied')=>db.prepare('INSERT INTO tutor_records(id,owner,kind,parent_id,state,data,request_hash,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(recordId,owner,kind,parent,state,JSON.stringify(data),'synthetic',date,state==='applied'?date:null).run();
 await record(prep,A,'preparation',null,{language:'en',references:[{noteId:a,expectedVersion:1},{noteId:pending,expectedVersion:1}]});
 await record(foreignPrep,B,'preparation',null,{language:'en',references:[]});
 await record(closing,A,'closing',prep,{changes:[{noteId:a,expectedVersion:1,clarified:'Approved closing without revision',title:'Synthetic',tags:[]}],references:[]});
 await record(sourceClosing,A,'closing',prep,{changes:[],references:[{noteId:a,expectedVersion:1}],reported:'UNRELATED SHARED CLASS REPORT',practice:'UNRELATED SHARED PRACTICE'});
 await record(parentClosing,A,'closing',prep,{changes:[],references:[],reported:'UNRELATED PARENT REPORT'});
 await record(proposedClosing,A,'closing',prep,{changes:[{noteId:a,expectedVersion:1,clarified:'PROPOSED CLOSING MUST STAY HIDDEN'}]},'proposed');
 await record(id(),B,'closing',foreignPrep,{changes:[{noteId:a,expectedVersion:1,clarified:'FOREIGN CLOSING MUST STAY HIDDEN'}]});
 await db.prepare('UPDATE notes SET clarified=? WHERE id=?').bind('Approved closing without revision',a).run();
 const teacher={id:id(),text:'Historical teacher text',examples:'Synthetic exercise',questions:'Synthetic question',createdAt:date,classDate:'2026-01-01',author:A,recordedBy:'Synthetic recorder',teacherName:'Synthetic teacher',attribution:'Literal teacher attribution',consultedVersion:1};
 const user={...teacher,id:id(),text:'Learner observation with teacher present',attribution:'Literal learner attribution'};
 const session={notes:{[a]:{snapshot:{id:a,version:1},status:'worked',entries:[teacher,user]},[pending]:{snapshot:{id:pending,version:1},status:'pending',entries:[]}}};
 await db.prepare('INSERT INTO class_sessions(class_id,owner,version,data) VALUES(?,?,2,?)').bind(prep,A,JSON.stringify(session)).run();
 for(const [version,data]of [[1,{notes:{[a]:{...session.notes[a],entries:[teacher]}}}],[2,session]])await db.prepare('INSERT INTO class_session_events(id,owner,class_id,version,request_hash,data,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(),A,prep,version,'synthetic',JSON.stringify(data),date).run();
 await db.prepare('INSERT INTO class_sessions(class_id,owner,version,data) VALUES(?,?,1,?)').bind(foreignPrep,A,JSON.stringify({notes:{[a]:{...session.notes[a],entries:[{...teacher,id:id(),text:'INVALID FOREIGN CLASS RELATION'}]}}})).run();
 const missingEntry=id();await db.prepare('INSERT INTO class_session_integrations(entry_id,owner,class_id,note_id,closing_id) VALUES(?,?,?,?,?)').bind(missingEntry,A,prep,a,closing).run();
 const early=id(),late=id(),named=id(),foreignContribution=id();
 const contribution=async(cid,owner,note,text,at,extra={})=>db.prepare("INSERT INTO memory_contributions(id,owner,note_id,text,author_role,recorder_role,recorder_name,class_id,state,approved_by,created_at,applied_at) VALUES(?,?,?,?,'user',?,?,?,'applied',?,?,?)").bind(cid,owner,note,text,extra.role??null,extra.name??null,extra.classId??null,owner,at,at).run();
 await contribution(early,A,a,'Earlier UTC instant','2026-01-02T12:00:00Z',{classId:foreignPrep});
 await contribution(late,A,a,'Later UTC instant','2026-01-02T10:00:00-05:00');
 await contribution(named,A,a,'Named recorder without account ID',date,{role:'tutor',name:'Synthetic visiting tutor'});
 await contribution(foreignContribution,B,a,'FOREIGN CONTRIBUTION MUST STAY HIDDEN',date);
 const audio=id(),bytes=await readFile('tests/fixtures/synthetic.m4a');await(await mf.getR2Bucket('BUCKET')).put('synthetic-review-audio',bytes);
 await db.prepare("INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at) VALUES(?,?,?,?,1,'audio/mp4',?,'personal',?)").bind(audio,A,a,'synthetic-review-audio',bytes.length,date).run();
 await db.prepare("INSERT INTO memory_contribution_attachments(contribution_id,attachment_id,speaker_name,recorder_role,recorder_name) VALUES(?,?,'Synthetic unnamed-role speaker','user','Synthetic named recorder')").bind(named,audio).run();
 await db.prepare('INSERT INTO revisions(id,owner,note_id,version,content,created_at) VALUES(?,?,?,?,?,?)').bind(id()+':'+bad,A,bad,2,'null',date).run();
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(r=>r.name);
 const dump=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.prepare('SELECT * FROM "'+t+'"').all()).results.map(x=>JSON.stringify(x)).sort()])));
 const before=await dump(),r=await call(a),memory=r.body.memory;
 await check('successful read',()=>assert.equal(r.status,200));
 await check('applied closing without revision kept exactly once',()=>assert.equal(memory.entries.filter(e=>e.source.closingId===closing).length,1));
 await check('current clarification is not duplicated as a legacy fallback',()=>assert.equal(memory.entries.filter(e=>e.text==='Approved closing without revision').length,1));
 await check('historical class entries occur once despite audit snapshots',()=>{for(const e of [teacher,user])assert.equal(memory.entries.filter(x=>x.source.id===e.id).length,1);});
 await check('legacy authors stay unknown even with teacherName and attribution',()=>{for(const e of [teacher,user])assert.equal(memory.entries.find(x=>x.source.id===e.id).author.role,'unknown');});
 await check('dangling integration cannot claim a missing contribution',()=>assert(!JSON.stringify(memory).includes(missingEntry)));
 await check('class-scoped report is linked without assigning it to a note',()=>{const c=memory.classContexts.find(c=>c.closingId===sourceClosing);assert.equal(c.relation,'source');assert.equal(c.url,'/api/preparations/'+prep);});
 await check('preparation membership does not imply actual class work',async()=>{const m=(await call(pending)).body.memory;assert.equal(m.history.hasClassWork,false);assert(m.classContexts.some(c=>c.closingId===parentClosing&&c.relation==='preparation_reference'));});
 await check('invalid class ownership relation hidden',()=>assert(!JSON.stringify(memory).includes('INVALID FOREIGN CLASS RELATION')));
 await check('foreign optional class ID hidden',()=>assert.equal(memory.entries.find(e=>e.source.id===early).source.classId,undefined));
 await check('UTC instants ordered rather than timestamp strings',()=>assert(memory.entries.findIndex(e=>e.source.id===early)<memory.entries.findIndex(e=>e.source.id===late)));
 await check('recorder attribution retained without account ID',()=>assert.deepEqual(memory.entries.find(e=>e.source.id===named).recordedBy,{role:'tutor',id:null,name:'Synthetic visiting tutor'}));
 await check('speaker name retained without inferred role',()=>assert.deepEqual(memory.entries.find(e=>e.source.id===named).attachments[0].speaker,{role:'unknown',id:null,name:'Synthetic unnamed-role speaker'}));
 await check('attachment recorder retained without account ID',()=>assert.deepEqual(memory.entries.find(e=>e.source.id===named).attachments[0].recordedBy,{role:'user',id:null,name:'Synthetic named recorder'}));
 await check('shared unrelated content and proposals excluded',()=>{for(const marker of ['UNRELATED','PROPOSED CLOSING','FOREIGN CLOSING','FOREIGN CONTRIBUTION'])assert(!JSON.stringify(memory).includes(marker));});
 await check('repeat projection is byte stable and IDs unique',async()=>{assert.deepEqual((await call(a)).body,r.body);assert.equal(new Set(memory.entries.map(e=>e.id)).size,memory.entries.length);});
 await check('invalid history fails explicitly as conflict',async()=>assert.equal((await call(bad)).status,409));
 await check('authorization remains private',async()=>{assert.equal((await call(a,B)).status,404);assert.equal((await call(a,null)).status,401);assert.equal((await call(a,A,'POST')).status,404);});
 await check('duplicate contribution identity rejected',async()=>assert.rejects(contribution(early,A,a,'Conflicting reuse',date),/UNIQUE/));
 await check('invalid approval states rejected',async()=>{
  for(const [state,approved,applied]of [['mastered',A,date],['applied',null,date],['applied',A,null],['proposed',null,date]])await assert.rejects(db.prepare("INSERT INTO memory_contributions(id,owner,note_id,author_role,state,approved_by,created_at,applied_at) VALUES(?,?,?,'user',?,?,?,?)").bind(id(),A,a,state,approved,date,applied).run());
 });
 await check('attachment relationship identity and foreign keys enforced',async()=>{
  await assert.rejects(db.prepare('INSERT INTO memory_contribution_attachments(contribution_id,attachment_id) VALUES(?,?)').bind(named,audio).run(),/UNIQUE/);
  await assert.rejects(db.prepare('INSERT INTO memory_contribution_attachments(contribution_id,attachment_id) VALUES(?,?)').bind(named,id()).run(),/FOREIGN KEY/);
 });
 await check('late failed batch rolls back new contribution without altering old data',async()=>{
  const failed=id();await assert.rejects(db.batch([db.prepare("INSERT INTO memory_contributions(id,owner,note_id,author_role,created_at) VALUES(?,?,?,'user',?)").bind(failed,A,a,date),db.prepare('INSERT INTO memory_contribution_attachments(contribution_id,attachment_id) VALUES(?,?)').bind(failed,id())]),/FOREIGN KEY/);
  assert.equal(await db.prepare('SELECT id FROM memory_contributions WHERE id=?').bind(failed).first(),null);
 });
 await check('reading changes no old or new rows',async()=>assert.deepEqual(await dump(),before));
 const report={base:'18801a5a479c5bbb185918d7a1b9f788a63964f9',passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,syntheticOnly:true,checks};
 await writeFile('.sites-runtime/evidence/memory-read-review'+(process.argv.includes('--baseline')?'-baseline':'')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));assert.equal(report.failed,0,'review edge cases');
}finally{await mf.dispose();}
