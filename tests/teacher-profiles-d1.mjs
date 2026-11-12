import './local-evidence.mjs';
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {Miniflare} from 'miniflare';
import {teacherEditInsertSql,teacherUpdateSql} from '../lib/teacher-write-sql.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:false,host:'127.0.0.1'});let passed=0;const ok=(v,m)=>{assert.ok(v,m);passed++;};
try{
 const db=await mf.getD1Database('DB');const execute=async file=>{const sql=await readFile(file,'utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));};
 for(const n of ['0000_mature_forgotten_one','0001_aromatic_gateway','0002_living_galactus','0003_amazing_molly_hayes','0004_lonely_paper_doll'])await execute('drizzle/'+n+'.sql');await execute('tests/class-navigation-fixture.sql');
 const tables=['notes','attachments','tags','note_tags','revisions','debriefs','tutor_records','tutor_threads','tutor_thread_members','tutor_thread_events'];const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.prepare('SELECT * FROM '+t).all()).results])));const before=await snapshot();
 await execute('drizzle/0005_blushing_veda.sql');ok(JSON.stringify(before)===JSON.stringify(await snapshot()),'migration preserves notes/classes/history and associations');ok((await db.prepare('SELECT COUNT(*) AS n FROM teachers').first()).n===0,'migration invents no teachers');
 await db.prepare("INSERT INTO teachers(id,owner,name,request_hash,created_at,updated_at) VALUES('t','qa','Synthetic','hash','date','date')").run();
 const edit=(id,version,name)=>[db.prepare(teacherEditInsertSql).bind(id,'qa','t',version+1,'hash','{}','date'),db.prepare(teacherUpdateSql).bind(name,'[]','','date','t','qa',version)];
 const races=await Promise.allSettled([db.batch(edit('a',1,'A')),db.batch(edit('b',1,'B'))]);ok(races.filter(r=>r.status==='fulfilled').length===1,'competing profile edits have one winner');ok((await db.prepare("SELECT version FROM teachers WHERE id='t'").first()).version===2,'profile version advances once');ok((await db.prepare("SELECT COUNT(*) AS n FROM teacher_edits").first()).n===1,'one audit revision from concurrent edits');
 const current=await db.prepare("SELECT * FROM teachers WHERE id='t'").first();await assert.rejects(db.batch([...edit('late',2,'Late'),db.prepare("INSERT INTO teachers(id,owner,name,request_hash,created_at,updated_at) VALUES('bad','qa',NULL,'hash','date','date')")]),/NOT NULL/);passed++;
 ok(JSON.stringify(current)===JSON.stringify(await db.prepare("SELECT * FROM teachers WHERE id='t'").first()),'late failure rolls back profile edit');ok(!await db.prepare("SELECT id FROM teacher_edits WHERE id='late'").first(),'late failure rolls back audit');
 ok(JSON.stringify(before)===JSON.stringify(await snapshot()),'profile writes do not modify classes, notes or history');
 const out={passed,scope:'Ephemeral D1, additive migration over synthetic class/history fixtures, transactional concurrency and rollback'};await writeFile('.sites-runtime/evidence/teacher-profiles-d1.json',JSON.stringify(out,null,2));console.log(out);
}finally{await mf.dispose();}
