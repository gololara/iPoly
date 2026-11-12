import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import './local-evidence.mjs';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
let external=0,checks=0;const completed=[],owner='synthetic-class-removal',foreign='synthetic-other-owner',at='2026-01-01T00:00:00Z',uid=()=>crypto.randomUUID();
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false,outboundService:()=>{external++;return new Response('Blocked',{status:502});}});
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(v,message)=>{assert.ok(v,message);checks++;};
async function raw(path,body,who=owner,origin){const response=await mf.dispatchFetch('http://localhost/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'}:{}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
async function api(path,body,status=200,who=owner,origin){const r=await raw(path,body,who,origin);assert.equal(r.status,status,JSON.stringify({path,status,result:r}));checks++;return r.data;}
const remove=(c,n)=>({classId:c.id,expectedVersion:c.version,requestId:uid(),noteId:n.noteId,expectedNoteVersion:n.noteVersion,confirmed:true});
const approval=p=>({id:p.id,proposalVersion:1,contentHash:p.contentHash,confirmed:true,approvedContent:p.content});
let failure;
try{
 const db=await mf.getD1Database('DB');
 for(const f of(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const note=async(who=owner)=>{const id=uid();await db.prepare('INSERT INTO notes(id,owner,language,original,title,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,who,'sq','Original sintético '+id,'Memoria sintética '+id.slice(0,8),id,at,at).run();return id;};
 const makeClass=async(ids)=>api('classes',{id:uid(),language:'sq',title:'Clase sintética',memories:ids.map(noteId=>({noteId,expectedVersion:1}))},201);
 const a=await note(),b=await note(),other=await note(foreign),attachment=uid(),bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
 await (await mf.getR2Bucket('BUCKET')).put('synthetic-original',bytes,{httpMetadata:{contentType:'image/png'}});
 await db.prepare('INSERT INTO attachments(id,owner,note_id,object_key,mime,size,origin,created_at,included) VALUES(?,?,?,?,?,?,?,?,1)').bind(attachment,owner,a,'synthetic-original','image/png',bytes.length,'personal',at).run();
 const original=(await api('notes/'+a)).note,originalMemory=(await api('memories/'+a)).memory;
 let c=await makeClass([a,b]);const command=remove(c,c.memories.find(n=>n.noteId===a));
 await api('class-memory-removal',command,401,null);await api('class-memory-removal',command,404,foreign);await api('class-memory-removal',command,403,owner,'https://foreign.example.test');
 await api('class-memory-removal',{...command,confirmed:false},400);await api('class-memory-removal',{...command,expectedNoteVersion:2},409);await api('class-memory-removal',{...command,expectedVersion:0},409);await api('class-memory-removal',{...command,noteId:other},404);
 completed.push('owner/origin/explicit confirmation and class/note versions enforced');
 const eventsBefore=(await db.prepare('SELECT * FROM class_session_events WHERE class_id=? ORDER BY version').bind(c.id).all()).results;
 c=await api('class-memory-removal',command);eq(c.memories.map(n=>n.noteId),[b]);eq(c.version,2);
 eq((await api('notes/'+a)).note,original);eq((await api('memories/'+a)).memory,originalMemory);
 const file=await mf.dispatchFetch('http://localhost/api/files/'+attachment,{headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test'}});eq(file.status,200);eq(new Uint8Array(await file.arrayBuffer()),bytes);
 const session=JSON.parse((await db.prepare('SELECT data FROM class_sessions WHERE class_id=?').bind(c.id).first()).data);ok(typeof session.notes[a].removedAt==='string','membership tombstone retained');eq(session.notes[a].snapshot,original);eq(session.notes[a].entries,[]);eq(session.activeNoteId,b);
 const eventsAfter=(await db.prepare('SELECT * FROM class_session_events WHERE class_id=? ORDER BY version').bind(c.id).all()).results;eq(eventsAfter.slice(0,-1),eventsBefore);eq(eventsAfter.length,eventsBefore.length+1);
 eq((await api('classes/'+c.id)).memories.map(n=>n.noteId),[b]);eq((await api('classes/'+c.id+'?q='+encodeURIComponent(original.title))).matchedNoteIds,[]);eq((await api('classes?language=sq')).classes.find(x=>x.id===c.id).total,1);
 eq(await api('class-memory-removal',command),c);eq((await db.prepare('SELECT COUNT(*) n FROM class_session_events WHERE class_id=?').bind(c.id).first()).n,eventsAfter.length);await api('class-memory-removal',{...command,noteId:b},409);
 ok((await api('memories?language=sq')).memories.some(n=>n.id===a),'removed memory is available in global picker');
 const future=await makeClass([a]);eq(future.memories[0].noteId,a);eq((await api('memories/'+a)).memory,originalMemory);
 c=await api('class-memories',{classId:c.id,expectedVersion:c.version,requestId:uid(),memories:[{noteId:a,expectedVersion:1}]});eq(c.memories.length,2);eq(JSON.parse((await db.prepare('SELECT data FROM class_sessions WHERE class_id=?').bind(c.id).first()).data).notes[a].snapshot,original);
 const beforeReplay=c.version;c=await api('class-memory-removal',command);eq(c.version,beforeReplay);ok(c.memories.some(n=>n.noteId===a),'old receipt cannot detach a later re-addition');
 for(const n of [...c.memories])c=await api('class-memory-removal',remove(c,n));eq(c.memories,[]);eq((await api('classes?language=sq')).classes.find(x=>x.id===c.id).total,0);
 c=await api('class-memories',{classId:c.id,expectedVersion:c.version,requestId:uid(),memories:[{noteId:a,expectedVersion:1}]});eq(c.memories[0].noteId,a);
 completed.push('removal/reload/search/counts/empty class, exact original/media/history, replay and re-addition');
 let worked=await makeClass([b]);worked=await api('class-memory-reviewed',{classId:worked.id,expectedVersion:worked.version,requestId:uid(),noteId:b,expectedNoteVersion:1,reviewed:true});ok(worked.memories[0].removalBlockedReason.includes('marcada'),'worked mark has a clear blocker');await api('class-memory-removal',remove(worked,worked.memories[0]),409);worked=await api('class-memory-reviewed',{classId:worked.id,expectedVersion:worked.version,requestId:uid(),noteId:b,expectedNoteVersion:1,reviewed:false});worked=await api('class-memory-removal',remove(worked,worked.memories[0]));eq(worked.memories.length,0);
 completed.push('worked memory requires explicit unmarking; removal never silently resets work');

 // Synthetic shape of Shpend's legacy class: seven preparation references,
 // two taught references, and four memories added later. No production IDs/data.
 const refs=[];for(let i=0;i<7;i++){const id=await note();refs.push({noteId:id,expectedVersion:1,snapshot:(await api('notes/'+id)).note});}
 const prep=uid(),thread=uid(),teacher=uid(),legacyData={language:'sq',title:'Clase legacy sintética con Shpend',summary:'Contexto sintético, no prueba de trabajo',references:refs};
 await db.prepare('INSERT INTO teachers(id,owner,name,languages,request_hash,created_at,updated_at,language_id) VALUES(?,?,?,?,?,?,?,?)').bind(teacher,owner,'Shpend (fixture sintético)','["sq"]',teacher,at,at,'sq').run();
 await db.prepare("INSERT INTO tutor_records(id,owner,kind,state,data,request_hash,created_at,applied_at) VALUES(?,?,'preparation','applied',?,?,?,?)").bind(prep,owner,JSON.stringify(legacyData),prep,at,at).run();
 await db.prepare('INSERT INTO tutor_threads(id,owner,language,current_preparation_id,request_hash,created_at) VALUES(?,?,?,?,?,?)').bind(thread,owner,'sq',prep,thread,at).run();await db.prepare('INSERT INTO tutor_thread_members(preparation_id,thread_id,owner,created_at) VALUES(?,?,?,?)').bind(prep,thread,owner,at).run();
 let legacy=await api('classes/'+thread);const later=[];for(let i=0;i<4;i++)later.push(await note());legacy=await api('class-memories',{classId:thread,expectedVersion:legacy.version,requestId:uid(),memories:later.map(noteId=>({noteId,expectedVersion:1}))});
 const protectedTables=async()=>Promise.all(['notes','attachments','memory_attribution_corrections','tutor_records','tutor_threads','tutor_thread_members','class_details','class_teachers','teacher_share_copies','teacher_share_outbox','revisions'].map(async table=>(await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results));
 const historicalBefore=await protectedTables();
 const unworkedRef=refs[2].noteId;legacy=await api('class-memory-removal',remove(legacy,legacy.memories.find(n=>n.noteId===unworkedRef)));legacy=await api('class-memory-removal',remove(legacy,legacy.memories.find(n=>n.noteId===later[0])));
 eq(legacy.id,thread);eq(legacy.preparationId,prep);eq(legacy.memories.length,9);eq((await api('preparations/'+prep+'/class-session')).notes.length,9);eq((await api('classes/'+prep)).memories.length,9);eq((await api('classes?language=sq')).classes.find(x=>x.id===thread).total,9);eq(await protectedTables(),historicalBefore);
 eq((await api('preparations/'+prep)).preparation.data,legacyData);eq((await makeClass([unworkedRef,later[0]])).memories.map(n=>n.noteId),[unworkedRef,later[0]]);
 await api('class-contribution',{preparationId:prep,expectedVersion:legacy.version,requestId:uid(),noteId:unworkedRef,consultedVersion:1,status:'worked',text:'Stale legacy write',examples:'',questions:'',attributedTo:'teacher'},409);
 const contributionInput=(noteId,classId=thread)=>({id:uid(),noteId,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'addition',text:'Explicación sintética del maestro',context:'Relato explícito del fixture',author:{role:'tutor',id:teacher},recordedBy:{role:'user'},classId});
 await api('memory-proposals',contributionInput(unworkedRef),409);await api('memory-proposals',contributionInput(later[0]),409);
 for(const id of refs.slice(0,2).map(r=>r.noteId)){const p=(await api('memory-proposals',contributionInput(id),201)).proposal;await api('memory-approval',approval(p));legacy=await api('classes/'+thread);const before=(await api('memories/'+id)).memory;ok(before.entries.some(e=>e.author.role==='tutor'&&e.author.id===teacher&&e.source.classId===thread),'tutor provenance preserved');await api('class-memory-removal',remove(legacy,legacy.memories.find(n=>n.noteId===id)),409);eq((await api('memories/'+id)).memory,before);}
 const pendingNote=refs[3].noteId,pending=(await api('memory-proposals',contributionInput(pendingNote),201)).proposal;legacy=await api('classes/'+thread);ok(legacy.memories.find(n=>n.noteId===pendingNote).removalBlockedReason.includes('pendiente'),'pending contribution blocks removal');await api('class-memory-removal',remove(legacy,legacy.memories.find(n=>n.noteId===pendingNote)),409);await api('memory-cancellation',{id:pending.id,proposalVersion:1,contentHash:pending.contentHash,confirmed:true});legacy=await api('class-memory-removal',remove(legacy,legacy.memories.find(n=>n.noteId===pendingNote)));
 const entryNote=refs[4].noteId;await api('class-contribution',{preparationId:prep,expectedVersion:legacy.version,requestId:uid(),noteId:entryNote,consultedVersion:1,status:'pending',text:'Aporte legacy sintético conservado',examples:'',questions:'',attributedTo:'teacher'});legacy=await api('classes/'+thread);const legacyHistory=(await api('memories/'+entryNote)).memory;await api('class-memory-removal',remove(legacy,legacy.memories.find(n=>n.noteId===entryNote)),409);eq((await api('memories/'+entryNote)).memory,legacyHistory);
 const closing=(await api('closings',{id:uid(),preparationId:prep,expectedPreparationVersion:1,summary:'Cierre sintético',reported:'No autorizar cambios en memoria retirada',practice:'',changes:[{noteId:unworkedRef,expectedVersion:1,clarified:'No aplicar',title:'',tags:[]}]},201)).record;await api('tutor/apply',{id:closing.id,expectedVersion:closing.version,confirmed:true},409);eq((await api('notes/'+unworkedRef)).note,refs[2].snapshot);
 completed.push('legacy references and late additions detach; preparation/source IDs survive; teacher/legacy entries and pending approvals protected; stale writers blocked');

 for(let i=0;i<8;i++){
  const id=await note(),raceClass=await makeClass([id]),version=raceClass.version;
  const race=await Promise.all([raw('class-memory-removal',remove(raceClass,raceClass.memories[0])),raw('class-memory-reviewed',{classId:raceClass.id,expectedVersion:version,requestId:uid(),noteId:id,expectedNoteVersion:1,reviewed:true})]);
  eq(race.filter(r=>r.status===200).length,1);ok(race.every(r=>[200,404,409].includes(r.status)),'remove/mark race only succeeds once');eq((await api('classes/'+raceClass.id)).version,version+1);
  const id2=await note(),contributionClass=await makeClass([id2]);
  const race2=await Promise.all([raw('class-memory-removal',remove(contributionClass,contributionClass.memories[0])),raw('memory-proposals',contributionInput(id2,contributionClass.id))]);eq(race2.filter(r=>[200,201].includes(r.status)).length,1);ok(race2.every(r=>[200,201,409].includes(r.status)),'remove/propose race cannot leave an approved orphan');
 }
 completed.push('eight remove/mark and eight remove/propose races serialize without lost updates');
 eq(external,0);
}catch(error){failure=error.message;throw error;}finally{
 const report={passed:checks,completed,failure,syntheticOnly:true,ephemeralD1:true,ephemeralR2:true,externalRequests:external,production:false};await writeFile('.sites-runtime/evidence/class-memory-removal-integration.json',JSON.stringify(report,null,2)+'\n');console.log(report);await mf.dispose();
}
