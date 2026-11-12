import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
export const memoryFixture={owner:'synthetic-memory-detail',rich:'70000000-0000-4000-8000-000000000001',empty:'70000000-0000-4000-8000-000000000002',unknown:'70000000-0000-4000-8000-000000000003',missing:'70000000-0000-4000-8000-000000000004',interrupted:'70000000-0000-4000-8000-000000000005',teacher:'70000000-0000-4000-8000-000000000020',photo:'70000000-0000-4000-8000-000000000021',audio:'70000000-0000-4000-8000-000000000022'};
export const fixtureHeaders={'oai-authenticated-user-id':memoryFixture.owner,'oai-authenticated-user-email':'memory-detail@example.test'};
// Initial synthetic seeding only. Refuse an existing database; callers use one
// ephemeral D1/R2 with outbound networking blocked, never the persistent DB.
export async function seedMemoryDetail(mf){
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 for(const name of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+name,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 assert.equal((await db.prepare('SELECT count(*) total FROM notes').first()).total,0,'Use an empty isolated fixture database');
 const at='2026-10-20T10:00:00.000Z',f=memoryFixture;
 for(const [id,original,title]of [[f.rich,'En una tienda escuché una expresión que no entendí. Quiero pedir que repitan una frase con calma.','¿Cómo pido que repitan algo?'],[f.empty,'Una experiencia nueva, pendiente de aclarar.','Una memoria por aclarar'],[f.unknown,'Escuché una expresión que quiero entender mejor.','Un recuerdo con historial']])await db.prepare('INSERT INTO notes(id,owner,language,original,title,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,f.owner,'sq',original,title,id,at,at).run();
 await db.prepare('INSERT INTO teachers(id,owner,name,languages,request_hash,created_at,updated_at,language_id) VALUES(?,?,?,?,?,?,?,?)').bind(f.teacher,f.owner,'Tutor de ejemplo','["Shqip"]',f.teacher,at,at,'sq').run();
 for(const [id,mime,file]of [[f.photo,'image/png','public/icon-192.png'],[f.audio,'audio/mp4','tests/fixtures/synthetic.m4a']]){const bytes=await readFile(file);await bucket.put('synthetic-detail/'+id,bytes);await db.prepare('INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at,duration_ms) VALUES(?,?,?,?,1,?,?,?,?,?)').bind(id,f.owner,f.rich,'synthetic-detail/'+id,mime,bytes.length,'personal',at,mime.startsWith('audio/')?952:null).run();}
 await db.prepare('INSERT INTO tags(id,owner,name,normalized) VALUES(?,?,?,?)').bind('synthetic-context',f.owner,'Vida diaria','vida diaria').run();await db.prepare('INSERT INTO note_tags(note_id,tag_id) VALUES(?,?)').bind(f.rich,'synthetic-context').run();
 // Seed only this disposable synthetic database. No writer API is exposed by
 // the read-only release; the separately reviewed approval branch stays intact.
 const records=[
  {kind:'debrief',text:'Separar lo que escuché de lo que quería decir. Queda pendiente confirmar una forma natural.',context:'Una conversación cotidiana en una tienda.',role:'ai',name:'IA de ejemplo'},
  {kind:'exercise',text:'Ensayar dos maneras de pedir que repitan una frase.',context:'',role:'tutor',name:'Tutor de ejemplo'},
  {kind:'addition',text:'Quiero probarlo en otra conversación y anotar qué me resulta difícil.',context:'',role:'user',name:'Usuario de ejemplo'},
  {kind:'addition',text:'PROPOSAL MUST NOT BE VISIBLE IN THE TIMELINE',context:'',role:'ai',name:'IA de ejemplo',pending:true}
 ];
 for(const r of records){
  const id=crypto.randomUUID();
  if(r.pending){
   const response=await mf.dispatchFetch('http://localhost/api/memory-proposals',{method:'POST',headers:{...fixtureHeaders,'Content-Type':'application/json'},body:JSON.stringify({id,noteId:f.rich,expectedNoteVersion:1,expectedMemoryVersion:0,kind:r.kind,text:r.text,context:r.context,author:{role:r.role,name:r.name},recordedBy:{role:'user'}})});
   assert.equal(response.status,201,await response.text());
   continue;
  }
  await db.prepare("INSERT INTO memory_contributions(id,owner,note_id,kind,text,context,author_role,author_id,author_name,recorder_role,recorded_by,recorder_name,state,approved_by,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'applied',?,?,?)").bind(id,f.owner,f.rich,r.kind,r.text,r.context,r.role,r.role==='tutor'?f.teacher:r.role==='user'?f.owner:null,r.name,'user',f.owner,'Usuario de ejemplo',f.owner,at,at).run();
  if(r.role==='tutor')await db.prepare('INSERT INTO memory_contribution_attachments(contribution_id,attachment_id,speaker_role,speaker_id,speaker_name,recorder_role,recorded_by,recorder_name,consent_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,f.audio,'tutor',f.teacher,'Tutor de ejemplo','user',f.owner,'Usuario de ejemplo','2026-10-20T09:59:00Z').run();
 }
 await db.prepare('UPDATE notes SET clarified=?,version=3 WHERE id=?').bind('Una aclaración reciente sin autor documentado.',f.unknown).run();for(const [version,text]of [[2,'Una aclaración antigua sin autor documentado.'],[3,'Una aclaración reciente sin autor documentado.']])await db.prepare('INSERT INTO revisions(id,owner,note_id,version,content,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID()+':'+f.unknown,f.owner,f.unknown,version,JSON.stringify({after:{noteId:f.unknown,expectedVersion:version-1,clarified:text}}),at).run();
 return f;
}
