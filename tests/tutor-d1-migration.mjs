import './local-evidence.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {tutorApplySql} from '../lib/tutor-apply-sql.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("Local synthetic D1 test");}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:false,host:'127.0.0.1'});let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
try{
 const db=await mf.getD1Database('DB');
 const migrations=await Promise.all(['0000_mature_forgotten_one','0001_aromatic_gateway','0002_living_galactus','0003_amazing_molly_hayes'].map(n=>readFile('drizzle/'+n+'.sql','utf8')));
 for(const s of migrations.slice(0,3))await db.batch(s.split(';').filter(x=>x.trim()).map(x=>db.prepare(x)));
 await db.prepare("INSERT INTO notes(id,owner,language,original,created_at,updated_at,request_hash) VALUES('n','qa','sq','Synthetic original','date','date','hash')").run();
 const before=await db.prepare("SELECT * FROM notes").all();
 await db.batch(migrations[3].split(';').filter(x=>x.trim()).map(x=>db.prepare(x)));
 ok(JSON.stringify(before.results)===JSON.stringify((await db.prepare('SELECT * FROM notes').all()).results),'migration preserves prior notes');
 const insert=(id,kind,data,parent=null)=>db.prepare('INSERT INTO tutor_records(id,owner,kind,parent_id,data,request_hash,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,'qa',kind,parent,JSON.stringify(data),'hash','date').run();
 const apply=(id)=>db.prepare(tutorApplySql).bind('now',id,'qa',1);
 await insert('p','preparation',{references:[{noteId:'n',expectedVersion:1}]});await db.batch([apply('p')]);ok((await db.prepare("SELECT version FROM tutor_records WHERE id='p'").first()).version===2,'valid preparation applied');
 await insert('c','closing',{expectedPreparationVersion:2,changes:[{noteId:'n',expectedVersion:1}]},'p');
 await assert.rejects(db.batch([apply('c'),db.prepare("UPDATE notes SET clarified='Synthetic changed',version=version+1 WHERE id='n'"),db.prepare("INSERT INTO revisions(id,owner,note_id,version,content,created_at) VALUES(NULL,'qa','n',2,'x','date')")]),/NOT NULL|constraint/i);checks++;
 const n=await db.prepare("SELECT original,clarified,version FROM notes WHERE id='n'").first(),c=await db.prepare("SELECT state,version,apply_guard FROM tutor_records WHERE id='c'").first();ok(n.original==='Synthetic original'&&n.clarified===''&&n.version===1,'D1 rolls back preceding note update');ok(c.state==='proposed'&&c.version===1&&c.apply_guard===1,'D1 rolls back preceding approval');
 await db.prepare("UPDATE notes SET version=2 WHERE id='n'").run();await assert.rejects(db.batch([apply('c')]),/tutor_apply_guard_check/);checks++;ok((await db.prepare("SELECT state FROM tutor_records WHERE id='c'").first()).state==='proposed','CHECK conflict preserves proposal');
 for(const id of ['e1','e2'])await insert(id,'closing',{expectedPreparationVersion:2,changes:[]},'p');
 const advance=()=>db.prepare("UPDATE tutor_records SET version=version+1 WHERE id='p' AND version=2");await db.batch([apply('e1'),advance()]);await assert.rejects(db.batch([apply('e2'),advance()]),/tutor_apply_guard_check/);checks++;ok((await db.prepare("SELECT version FROM tutor_records WHERE id='p'").first()).version===3,'competing empty closure does not double-advance parent');
 const result={passed:checks,scope:'Miniflare D1 binding, ephemeral database, synthetic note only',migration:'semicolon-split over prior schema',rollback:'late failure and CHECK conflict verified'};await writeFile('.sites-runtime/evidence/tutor-d1-migration-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await mf.dispose();}
