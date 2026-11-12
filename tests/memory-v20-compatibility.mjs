import {assertRetainedMcpContract} from './mcp-chat-contract.mjs';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import './local-evidence.mjs';

const fixture = async name=>JSON.parse(await readFile(new URL('./fixtures/compatibility/'+name,import.meta.url),'utf8'));
const owner = 'synthetic-v20-owner';
const at = '2026-01-01T10:00:00.000Z';
const modules = [{type:'ESModule',path:resolve('dist/server/index.js')},
  ...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js')
    .map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const mf = new Miniflare({modules, modulesRoot:resolve('dist/server'),
  compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
  d1Databases:['DB'], r2Buckets:['BUCKET'], d1Persist:false, r2Persist:false,
  outboundService:()=>new Response('Blocked',{status:502})});
let checks = 0;
const equal = (a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const ok = (value,message)=>{assert.ok(value,message);checks++;};
const sha = value=>createHash('sha256').update(value).digest('hex');

async function call(path, method='GET', body, who=owner) {
  const response = await mf.dispatchFetch('http://localhost'+path,{method,
    headers:{'Content-Type':'application/json',...(who?{'oai-authenticated-user-id':who,
      'oai-authenticated-user-email':who+'@example.test'}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
async function rpc(name,args={},who=owner) {
  const response=await call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name,arguments:args}},who);
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.result?.isError,undefined,JSON.stringify(response.body));
  return JSON.parse(response.body.result.content[0].text);
}
const approve = p=>({id:p.id,proposalVersion:1,contentHash:p.contentHash,
  confirmed:true,approvedContent:p.content});
const decision = p=>({id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true});
const memory = async id=>(await call('/api/memories/'+id)).body.memory;
const list = async query=>(await call('/api/memories?language=en&'+query)).body.memories;

try {
  // Published migration sources, snapshots and previous journal entries are immutable.
  const {checksums,journalEntries}=await fixture('migrations-v20.json');
  for(const [file,checksum] of Object.entries(checksums)) equal(sha(await readFile(file)),checksum,'published migration bytes: '+file);
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  equal(journal.entries.slice(0,journalEntries.length),journalEntries);
  equal(journal.entries.slice(journalEntries.length).map(e=>[e.idx,e.tag]),[[16,'0016_memory_approval'],[17,'0017_memory_uploads'],[18,'0018_simple_memory_classes'],[19,'0019_learning_languages'],[20,'0020_teachers_by_language']]);
  const oldSnapshot=JSON.parse(await readFile('drizzle/meta/0015_snapshot.json','utf8'));
  const snapshot=JSON.parse(await readFile('drizzle/meta/0016_snapshot.json','utf8'));
  equal(snapshot.prevId,oldSnapshot.id);
  equal(Object.keys(snapshot.tables).filter(k=>!oldSnapshot.tables[k]).sort(),['memory_heads','memory_proposals']);
  for(const [name,table] of Object.entries(oldSnapshot.tables)) equal(snapshot.tables[name],table,'preserved table metadata: '+name);

  let prior=snapshot;
  for(const [file,added] of [['0017',['memory_uploads']],['0018',['memory_classes']],['0019',['learning_languages']]]){
   const next=JSON.parse(await readFile('drizzle/meta/'+file+'_snapshot.json','utf8'));equal(next.prevId,prior.id);equal(Object.keys(next.tables).filter(k=>!prior.tables[k]).sort(),added);
   for(const [name,table] of Object.entries(prior.tables))equal(next.tables[name],table,'preserved table metadata: '+name);prior=next;
  }

  const db=await mf.getD1Database('DB'), bucket=await mf.getR2Bucket('BUCKET');
  const migrate=async file=>db.batch((await readFile('drizzle/'+file,'utf8')).split(';')
    .filter(s=>s.trim()).map(s=>db.prepare(s)));
  for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')&&!f.startsWith('0016_')).sort()) await migrate(file);
  const noteId=randomUUID(), debriefId=randomUUID(), photoId=randomUUID();
  const text='Synthetic legacy clarification retained through the upgrade.';
  await db.prepare('INSERT INTO notes(id,owner,language,original,clarified,created_at,updated_at,version,request_hash) VALUES(?,?,?,?,?,?,?,2,?)')
    .bind(noteId,owner,'en','Synthetic original capture',text,at,at,noteId).run();
  await db.prepare("INSERT INTO debriefs(id,owner,summary,changes,state,created_at,applied_at) VALUES(?,?,?,?,'applied',?,?)")
    .bind(debriefId,owner,'Synthetic debrief',JSON.stringify([{noteId,expectedVersion:1,clarified:text,tags:[]}]),at,at).run();
  const bytes=await readFile('public/icon-192.png');
  await bucket.put('synthetic-v20/'+photoId,bytes);
  await db.prepare('INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at) VALUES(?,?,?,?,1,?,?,?,?)')
    .bind(photoId,owner,noteId,'synthetic-v20/'+photoId,'image/png',bytes.length,'personal',at).run();
  const attribution=await rpc('ipoly_proponer_atribucion',{id:randomUUID(),noteId,debriefId,
    expectedNoteVersion:2,previousCorrectionId:null,author:{role:'ai',id:null,name:'Synthetic legacy AI'},
    evidence:{kind:'user_attestation',statement:'Synthetic attribution review.',reference:null}});
  await rpc('ipoly_aplicar_atribucion',approve(attribution));
  const tableNames=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(r=>r.name);
  const dump=async names=>Object.fromEntries(await Promise.all(names.map(async name=>[name,
    (await db.prepare('SELECT * FROM "'+name+'"').all()).results.map(r=>JSON.stringify(r)).sort()])));
  const before=await dump(tableNames);
  const oldSchema=(await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
  await migrate('0016_memory_approval.sql');
  equal(await dump(tableNames),before,'0016 preserves every v20 row, including applied attribution');
  for(const row of oldSchema) equal(await db.prepare('SELECT type,name,sql FROM sqlite_master WHERE name=?').bind(row.name).first(),row);

  // Preserve retained schemas/annotations; only debrief writers, descriptions and order change.
  const listed=(await call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'})).body.result.tools;
  assertRetainedMcpContract(listed);
  equal(listed.filter(t=>t.name.includes('atribucion')),await fixture('mcp-v20-attribution.json'),
    'all five v20 attribution descriptors are exact');

  const original=await memory(noteId), legacy=await rpc('ipoly_nota',{id:noteId});
  equal(original.contributionVersion,0);
  const legacyEntry=original.entries.find(e=>e.source.debriefId===debriefId);
  equal(legacyEntry.author.role,'ai');equal(legacyEntry.attribution.currentId,attribution.id);
  const draft={id:randomUUID(),noteId,expectedNoteVersion:2,expectedMemoryVersion:0,kind:'addition',
    text:'Unique-approved-addition-needle',context:'Unique-context-needle',author:{role:'user'},
    recordedBy:{role:'user'},attachments:[{attachmentId:photoId}]};
  const proposal=await rpc('ipoly_proponer_aportacion',draft);
  equal(await rpc('ipoly_aportacion',{id:proposal.id}),proposal,'review retrieves exact canonical content');
  equal((await memory(noteId)).pendingContributionCount,1);
  equal((await memory(noteId)).entries,original.entries,'pending proposal is not learning history');
  equal(await list('q=Unique-approved-addition-needle'),[],'pending text is not searchable');
  const tampered={...approve(proposal),approvedContent:{...proposal.content,text:'Changed after review'}};
  equal((await call('/api/memory-approval','POST',tampered)).status,409);
  equal((await call('/api/memory-approval','POST',{...approve(proposal),confirmed:false})).status,400);
  const applied=await rpc('ipoly_aplicar_aportacion',approve(proposal));
  equal(await rpc('ipoly_aplicar_aportacion',approve(proposal)),applied,'exact retry adds once');
  const changed=await memory(noteId);
  equal(changed.note.id,noteId);equal(changed.note,original.note);equal(changed.contributionVersion,1);
  equal(changed.entries.filter(e=>e.source.id===proposal.id).length,1);
  equal(changed.entries.find(e=>e.source.debriefId===debriefId),legacyEntry,'append preserves legacy attribution');
  equal(await rpc('ipoly_nota',{id:noteId}),legacy,'legacy note contract and versions do not change');
  equal((await list('q=Unique-approved-addition-needle&history=user')).map(n=>n.id),[noteId]);
  equal((await list('q=Unique-context-needle')).map(n=>n.id),[noteId]);
  equal((await list('history=ai&history=user')).filter(n=>n.id===noteId).length,1,'overlapping facts return one memory');
  equal(await dump(tableNames.filter(n=>!['memory_contributions','memory_contribution_attachments'].includes(n))),
    Object.fromEntries(Object.entries(before).filter(([n])=>!['memory_contributions','memory_contribution_attachments'].includes(n))),
    'append preserves all other v20 rows and the attribution journal');
  const media=await mf.dispatchFetch('http://localhost/api/files/'+photoId,{headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test'}});
  equal(Buffer.from(await media.arrayBuffer()),bytes,'original R2 bytes preserved');

  const cancelled=await rpc('ipoly_proponer_aportacion',{...draft,id:randomUUID(),expectedMemoryVersion:1,text:'Cancelled-private-needle'});
  await rpc('ipoly_cancelar_aportacion',decision(cancelled));
  equal(await list('q=Cancelled-private-needle'),[]);
  equal((await memory(noteId)).pendingContributionCount,0);
  equal((await call('/api/memory-approval','POST',approve(cancelled))).status,409);

  // These two journals are independent: correcting an old author neither resets
  // contributionVersion nor duplicates/deletes the new approved contribution.
  const reversal=await rpc('ipoly_proponer_atribucion',{id:randomUUID(),noteId,debriefId,
    expectedNoteVersion:2,previousCorrectionId:attribution.id,author:{role:'unknown',id:null,name:null},
    evidence:{kind:'user_attestation',statement:'Synthetic attribution reversal.',reference:null}});
  await rpc('ipoly_aplicar_atribucion',approve(reversal));
  const reversed=await memory(noteId);
  equal(reversed.contributionVersion,1);
  equal(reversed.entries.find(e=>e.source.id===proposal.id),changed.entries.find(e=>e.source.id===proposal.id));
  equal(reversed.entries.find(e=>e.source.debriefId===debriefId).attribution.history.length,2);
  ok(!(await list('history=ai')).some(n=>n.id===noteId),'attribution reversal reconciles AI filter');
  ok((await list('history=user')).some(n=>n.id===noteId),'new user contribution remains searchable');

  // New debrief contributions affect the new history, preserving legacy tutor eligibility.
  const fresh=randomUUID();
  await db.prepare('INSERT INTO notes(id,owner,language,original,created_at,updated_at,request_hash) VALUES(?,?,?,?,?,?,?)')
    .bind(fresh,owner,'en','Synthetic pending capture',at,at,fresh).run();
  const debrief=await rpc('ipoly_proponer_aportacion',{id:randomUUID(),noteId:fresh,
    expectedNoteVersion:1,expectedMemoryVersion:0,kind:'debrief',text:'New-debrief-needle',author:{role:'ai'}});
  await rpc('ipoly_aplicar_aportacion',approve(debrief));
  const freshMemory=await memory(fresh);
  equal(freshMemory.history.hasAppliedDebrief,true);equal(freshMemory.note.reviewed,0);
  equal((await list('q=New-debrief-needle&history=debrief')).map(n=>n.id),[fresh]);
  equal((await list('q=New-debrief-needle&history=no_debrief')).map(n=>n.id),[]);
  ok(!(await rpc('ipoly_notas',{language:'en',forTutor:true,review:'reviewed'})).notes.some(n=>n.id===fresh));
  const allTables=[...tableNames,'memory_heads','memory_proposals'],readState=await dump(allTables);
  await memory(noteId);await list('history=user');await rpc('ipoly_aportacion',{id:proposal.id});
  equal(await dump(allTables),readState,'history/search/review remain SELECT-only');

  const report={passed:checks,syntheticOnly:true,production:false,baseline:'v20 fixture',
    migrationAfter0015:true,oldMigrationBytesPreserved:true,v20RetainedToolSchemasAndAnnotations:14,publicTools:listed.length,retiredLegacyDebriefWriters:2,retiredLegacyTutorWriters:3,
    sourceRecordsPreserved:true,independentAttributionAndContributionJournals:true,
    pendingAndCancelledExcludedFromSearch:true,legacyTutorEligibilityPreserved:true};
  await writeFile('.sites-runtime/evidence/memory-v20-compatibility.json',JSON.stringify(report,null,2)+'\n');
  console.log(report);
} finally { await mf.dispose(); }
