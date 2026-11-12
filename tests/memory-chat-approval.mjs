import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import './local-evidence.mjs';
const baseline=process.argv.includes('--baseline'),owner='synthetic-chat-approval',other='synthetic-chat-other',uid=()=>crypto.randomUUID(),at='2026-01-01T00:00:00Z';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
let external=0;const routes=[],checks=[];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false,outboundService:()=>{external++;return new Response('Blocked',{status:502});}});
async function call(method,params={},who=owner){routes.push('/mcp');const response=await mf.dispatchFetch('http://localhost/mcp',{method:'POST',headers:{'Content-Type':'application/json',...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return {status:response.status,data:await response.json()};}
async function rpc(name,args={},who=owner){const r=await call('tools/call',{name,arguments:args},who);assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(!r.data.result?.isError,JSON.stringify(r.data));return JSON.parse(r.data.result.content[0].text);}
async function rejected(name,args,who=owner){const r=await call('tools/call',{name,arguments:args},who);assert.ok(r.status>=400||r.data.result?.isError,JSON.stringify(r.data));return r;}
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}}
const approve=p=>({id:p.id,proposalVersion:p.proposalVersion,contentHash:p.contentHash,approvedContent:structuredClone(p.content),confirmed:true});
try{
 const db=await mf.getD1Database('DB');for(const f of(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 if(!baseline)await rpc('ipoly_anadir_idioma',{name:'Shqip',confirmed:true});
 const id=uid(),literal='Quise explicar una carga de trabajo y me faltó una palabra.';
 const captured=await rpc('ipoly_guardar_nota',{id,language:'sq',original:literal,tags:[]});
 const original=await rpc('ipoly_nota',{id}),legacyId=uid();
 await db.prepare("INSERT INTO memory_contributions(id,owner,note_id,kind,text,context,author_role,state,approved_by,created_at,applied_at) VALUES(?,?,?,'addition',?,'','unknown','applied',?,?,?)").bind(legacyId,owner,id,'Fuente histórica sintética de autor incierto',owner,at,at).run();
 const before=await rpc('ipoly_memoria',{id});
 const input={id:uid(),noteId:id,expectedNoteVersion:before.note.version,expectedMemoryVersion:before.contributionVersion,kind:'debrief',text:'Aclaración sintética redactada por IA, separada del original.',context:'Contexto de aprendizaje revisado en el chat.',author:{role:'ai',name:'More (ChatGPT)'},recordedBy:{role:'user',name:'Usuario de ejemplo (fixture)'},classId:null,attachments:[]};
 const p=await rpc('ipoly_proponer_aportacion',input);
 await check('MCP proposal supports AI author and authenticated user recorder without a web step',async()=>{assert.equal(captured.note?.id??captured.id,id);assert.equal(original.original,literal);assert.equal(p.state,'proposed');assert.equal(p.content.author.role,'ai');assert.equal(p.content.author.id,null);assert.equal(p.content.recordedBy.role,'user');assert.equal(p.content.recordedBy.id,owner);assert.equal(p.content.kind,'debrief');assert.equal(p.content.classId,null);assert.deepEqual((await rpc('ipoly_memoria',{id})).entries,before.entries);assert.deepEqual(await rpc('ipoly_aportacion',{id:p.id}),p);});
 await check('false, missing or changed canonical approvals never apply',async()=>{await rejected('ipoly_aplicar_aportacion',{...approve(p),confirmed:false});const missing=approve(p);delete missing.approvedContent;await rejected('ipoly_aplicar_aportacion',missing);await rejected('ipoly_aplicar_aportacion',{...approve(p),contentHash:'0'.repeat(64)});await rejected('ipoly_aplicar_aportacion',{...approve(p),approvedContent:{...p.content,author:{...p.content.author,role:'user',id:owner}}});assert.equal((await rpc('ipoly_aportacion',{id:p.id})).state,'proposed');});
 await check('owner and actor impersonation checks still apply in chat',async()=>{await rejected('ipoly_aplicar_aportacion',approve(p),other);const unauth=await call('tools/call',{name:'ipoly_aplicar_aportacion',arguments:approve(p)},null);assert.equal(unauth.status,401);await rejected('ipoly_proponer_aportacion',{...input,id:uid(),author:{role:'ai',id:owner,name:'Wrong account claim'}});await rejected('ipoly_proponer_aportacion',{...input,id:uid(),recordedBy:{role:'user',id:other}});});
 const applied=await rpc('ipoly_aplicar_aportacion',approve(p));
 await check('the reviewed canonical proposal applies once entirely through MCP',async()=>{assert.equal(applied.state,'applied');assert.deepEqual(await rpc('ipoly_aplicar_aportacion',approve(p)),applied);const after=await rpc('ipoly_memoria',{id});assert.deepEqual(after.note,before.note);assert.deepEqual(after.entries.filter(e=>e.source.id!==p.id),before.entries);const entry=after.entries.find(e=>e.source.id===p.id);assert.equal(entry.author.role,'ai');assert.equal(entry.author.name,'More (ChatGPT)');assert.equal(entry.recordedBy.id,owner);assert.equal(after.entries.find(e=>e.source.id===legacyId).author.role,'unknown');assert.equal(after.contributionVersion,1);assert.equal(after.pendingContributionCount,0);assert.equal((await db.prepare('SELECT approved_by FROM memory_contributions WHERE id=?').bind(p.id).first()).approved_by,owner);});
 await check('stale note/contribution versions preserve the unapproved proposal',async()=>{const fresh=uid();await rpc('ipoly_guardar_nota',{id:fresh,language:'sq',original:'Otra vivencia literal'});const proposal=await rpc('ipoly_proponer_aportacion',{...input,id:uid(),noteId:fresh});await db.prepare('UPDATE notes SET version=version+1 WHERE id=?').bind(fresh).run();await rejected('ipoly_aplicar_aportacion',approve(proposal));assert.equal((await rpc('ipoly_aportacion',{id:proposal.id})).state,'proposed');assert.equal((await rpc('ipoly_memoria',{id:fresh})).contributionVersion,0);await rejected('ipoly_proponer_aportacion',{...input,id:uid(),expectedMemoryVersion:0});});
 const listed=(await call('tools/list')).data.result.tools,init=(await call('initialize')).data.result;
 await check('public discovery removes the two legacy debrief writers but keeps literal capture and approved memory writes',async()=>{assert.ok(!listed.some(t=>['ipoly_proponer_debriefing','ipoly_aplicar_debriefing'].includes(t.name)));for(const name of ['ipoly_guardar_nota','ipoly_memoria','ipoly_aportacion','ipoly_proponer_aportacion','ipoly_aplicar_aportacion'])assert.ok(listed.some(t=>t.name===name));const tool=listed.find(t=>t.name==='ipoly_aplicar_aportacion');assert.equal(tool.inputSchema.properties.confirmed.const,true);assert.ok(tool.inputSchema.required.includes('approvedContent'));assert.equal(tool.annotations.destructiveHint,true);assert.equal(tool.annotations.readOnlyHint,false);});
 await check('initialization and status make chat approval primary and legacy explicitly historical',async()=>{assert.ok(init.instructions.includes('ipoly_aplicar_aportacion'));assert.ok(init.instructions.includes('author.role=ai'));assert.ok(init.instructions.includes('recordedBy.role=user'));const state=await rpc('ipoly_estado');assert.equal(state.memory.approval.channel,'chat');assert.equal(state.memory.approval.requiresWebApproval,false);assert.equal(state.memory.approval.applyTool,'ipoly_aplicar_aportacion');assert.equal(state.debriefing.saveTool,'ipoly_proponer_aportacion');assert.equal(state.debriefing.applyTool,'ipoly_aplicar_aportacion');assert.equal(state.compatibility.newDebriefWrites,false);});
 await check('cached legacy write calls are rejected without creating or applying a legacy debrief',async()=>{const fresh=uid();await rpc('ipoly_guardar_nota',{id:fresh,language:'sq',original:'Captura literal para compatibilidad'});const oldNote=await rpc('ipoly_nota',{id:fresh}),legacyProposal=uid(),changes=[{noteId:fresh,expectedVersion:1,clarified:'Texto legacy sintético que no debe escribirse',tags:[]}],newId=uid();await db.prepare("INSERT INTO debriefs(id,owner,summary,changes,state,created_at) VALUES(?,?,?,?,'proposed',?)").bind(legacyProposal,owner,'Propuesta histórica conservada',JSON.stringify(changes),at).run();await rejected('ipoly_proponer_debriefing',{id:newId,summary:'No crear en nuevo chat',changes});await rejected('ipoly_aplicar_debriefing',{id:legacyProposal,confirmed:true});assert.deepEqual(await rpc('ipoly_nota',{id:fresh}),oldNote);assert.equal(await db.prepare('SELECT id FROM debriefs WHERE id=?').bind(newId).first(),null);assert.equal((await db.prepare('SELECT state FROM debriefs WHERE id=?').bind(legacyProposal).first()).state,'proposed');const history=await rpc('ipoly_debriefings');assert.ok(history.some(d=>d.id===legacyProposal&&d.state==='proposed'));});
 if(!baseline){
  const teacher=uid(),foreignTeacher=uid();
  for(const [id,who,name] of [[teacher,owner,'Maestra de prueba'],[foreignTeacher,other,'Perfil ajeno']]){
   await db.prepare('INSERT INTO teachers(id,owner,name,languages,delivery_preference,request_hash,created_at,updated_at,language_id) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id,who,name,'["Shqip"]','Dato privado fuera del catálogo',id,at,at,'sq').run();
  }
  await check('Chat finds only its own teacher profiles and receives no delivery preferences',async()=>{
   const result=await rpc('ipoly_maestros',{language:'sq'});
   assert.deepEqual(result,{teachers:[{id:teacher,name:'Maestra de prueba',languages:['Shqip']}],nextOffset:null});
   assert.deepEqual((await rpc('ipoly_maestros',{language:'sq'},other)).teachers.map(t=>t.id),[foreignTeacher]);
   assert.equal((await call('tools/call',{name:'ipoly_maestros',arguments:{language:'sq'}},null)).status,401);
   const tool=listed.find(t=>t.name==='ipoly_maestros');
   assert.equal(tool.annotations.readOnlyHint,true);
   assert.ok(init.instructions.includes('ipoly_maestros')&&init.instructions.includes('No crees una clase para guardar el aporte'));
  });
  await check('teacher contribution needs a real profile, the user recorder and exact approval; no class is created',async()=>{
   const memoryId=uid();
   await rpc('ipoly_guardar_nota',{id:memoryId,language:'sq',original:'Original de clase sintética'});
   const before=await rpc('ipoly_memoria',{id:memoryId});
   const draft={id:uid(),noteId:memoryId,expectedNoteVersion:before.note.version,expectedMemoryVersion:before.contributionVersion,
    kind:'addition',text:'La maestra explicó esta expresión en una conversación.',author:{role:'tutor',id:teacher},classId:null};
   await rejected('ipoly_proponer_aportacion',draft);
   await rejected('ipoly_proponer_aportacion',{...draft,author:{role:'tutor',id:foreignTeacher},recordedBy:{role:'user'}});
   const p=await rpc('ipoly_proponer_aportacion',{...draft,recordedBy:{role:'user'}});
   assert.equal(p.content.author.id,teacher);
   assert.equal(p.content.author.name,'Maestra de prueba');
   assert.equal(p.content.recordedBy.id,owner);
   assert.equal(p.content.classId,null);
   assert.deepEqual((await rpc('ipoly_memoria',{id:memoryId})).entries,before.entries);
   await rejected('ipoly_aplicar_aportacion',{...approve(p),confirmed:false});
   const applied=await rpc('ipoly_aplicar_aportacion',approve(p));
   assert.equal(applied.state,'applied');
   assert.deepEqual(await rpc('ipoly_aplicar_aportacion',approve(p)),applied);
   // A separate client starts without the proposal or conversational history.
   await call('initialize',{clientInfo:{name:'new-chat-fixture',version:'1'}});
   const matches=await rpc('ipoly_notas',{language:'sq',q:before.note.original});
   assert.deepEqual(matches.notes.map(n=>n.id),[memoryId]);
   const after=await rpc('ipoly_memoria',{id:matches.notes[0].id});
   const entries=after.entries.filter(e=>e.source.id===p.id);
   assert.equal(entries.length,1);
   assert.deepEqual(entries[0].author,{role:'tutor',id:teacher,name:'Maestra de prueba'});
   assert.equal(entries[0].recordedBy.role,'user');
   assert.equal(entries[0].recordedBy.id,owner);
   assert.equal(entries[0].text,draft.text);
   assert.deepEqual(after.note,before.note);
   assert.deepEqual(after.classContexts,[]);
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM memory_classes').first()).n,0);
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM class_sessions').first()).n,0);
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tutor_records').first()).n,0);
  });
 }
 await check('verification used no UI or web approval endpoint and no external connection',async()=>{assert.deepEqual([...new Set(routes)],['/mcp']);assert.equal(external,0);});
}finally{
 const report={sourcePhase:baseline?'v23-baseline':'local-candidate',syntheticOnly:true,production:false,webApprovalCalls:0,externalRequests:external,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks};await writeFile('.sites-runtime/evidence/memory-chat-approval'+(baseline?'-baseline':'')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await mf.dispose();if(report.failed)process.exitCode=1;
}
