import './local-evidence.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {tutorApplySql} from '../lib/tutor-apply-sql.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:false,host:'127.0.0.1'});
let passed=0;
const ok=(v,m)=>{assert.ok(v,m);passed++;};
try{
 const db=await mf.getD1Database('DB');
 for(const name of ['0000_mature_forgotten_one','0001_aromatic_gateway','0002_living_galactus','0003_amazing_molly_hayes','0004_lonely_paper_doll']){
  const sql=await readFile('drizzle/'+name+'.sql','utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 }
 await db.prepare("INSERT INTO notes(id,owner,language,original,clarified,worked,created_at,updated_at,request_hash) VALUES('n','qa','sq','Original','Manual clarification',1,'date','date','hash')").run();
 const insert=id=>db.prepare('INSERT INTO tutor_records(id,owner,kind,data,request_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id,'qa','preparation',JSON.stringify({references:[{noteId:'n',expectedVersion:1,snapshot:{reviewed:1}}]}),'hash','date').run();
 const apply=id=>db.prepare(tutorApplySql).bind('now',id,'qa',1);
 const blocked=async(id)=>{await assert.rejects(db.batch([apply(id)]),/tutor_apply_guard_check/);passed++;ok((await db.prepare('SELECT state,version FROM tutor_records WHERE id=?').bind(id).first()).state==='proposed','rejected approval preserves proposal');};
 await insert('legacy');await blocked('legacy');
 await db.prepare("INSERT INTO debriefs(id,owner,summary,changes,state,created_at) VALUES('d','qa','Summary',?,'proposed','date')").bind(JSON.stringify([{noteId:'n',expectedVersion:1}])).run();await blocked('legacy');
 await db.prepare("UPDATE debriefs SET state='applied',owner='other' WHERE id='d'").run();await blocked('legacy');
 await db.prepare("UPDATE debriefs SET owner='qa' WHERE id='d'").run();await blocked('legacy');
 await db.prepare("UPDATE notes SET version=2 WHERE id='n'").run();await blocked('legacy');
 await insert('current');await db.prepare("UPDATE tutor_records SET data=? WHERE id='current'").bind(JSON.stringify({references:[{noteId:'n',expectedVersion:2}]})).run();await db.batch([apply('current')]);ok((await db.prepare("SELECT state FROM tutor_records WHERE id='current'").first()).state==='applied','reviewed current version applied');
 await db.prepare("UPDATE notes SET version=3 WHERE id='n'").run();await insert('later');await db.prepare("UPDATE tutor_records SET data=? WHERE id='later'").bind(JSON.stringify({references:[{noteId:'n',expectedVersion:3}]})).run();await db.batch([apply('later')]);ok((await db.prepare("SELECT state FROM tutor_records WHERE id='later'").first()).state==='applied','later annotations remain eligible');
 for(const id of ['stale','same']){await insert(id);await db.prepare('UPDATE tutor_records SET data=? WHERE id=?').bind(JSON.stringify({references:[{noteId:'n',expectedVersion:3}]}),id).run();}
 await db.prepare("UPDATE notes SET version=4 WHERE id='n'").run();await blocked('stale');
 await db.prepare("UPDATE tutor_records SET data=? WHERE id='same'").bind(JSON.stringify({references:[{noteId:'n',expectedVersion:4}]})).run();await Promise.all([db.batch([apply('same')]),db.batch([apply('same')])]);ok((await db.prepare("SELECT version FROM tutor_records WHERE id='same'").first()).version===2,'concurrent identical approval increments once');
 ok((await db.prepare("SELECT original,clarified FROM notes WHERE id='n'").first()).original==='Original','original preserved');
 ok((await db.prepare("SELECT state FROM tutor_records WHERE id='current'").first()).state==='applied','existing applied preparation preserved');
 const result={passed,scope:'Ephemeral D1, synthetic data; raw/manual/proposed/foreign-owner/legacy versions, atomic approval and concurrent replay'};
 await writeFile('.sites-runtime/evidence/tutor-eligibility-d1.json',JSON.stringify(result,null,2));console.log(result);
}finally{await mf.dispose();}
