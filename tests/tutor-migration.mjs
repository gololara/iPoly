import './local-evidence.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tutorApplySql} from '../lib/tutor-apply-sql.ts';
const migrations=await Promise.all(['0000_mature_forgotten_one','0001_aromatic_gateway','0002_living_galactus','0003_amazing_molly_hayes'].map(n=>readFile('drizzle/'+n+'.sql','utf8')));
const old=await readFile('tests/fixtures/tutor-trigger-unapplied.sql','utf8');
const py=String.raw`
import sys,json,sqlite3
v=json.load(sys.stdin);checks=0
def ok(x,label):
 global checks
 assert x,label
 checks+=1
def parts(sql,separator=';'):
 return [s for s in sql.split(separator) if s.strip()]
def previous():
 d=sqlite3.connect(':memory:');d.execute('PRAGMA foreign_keys=ON')
 for sql in v['migrations'][:3]:
  for s in parts(sql):d.execute(s)
 d.execute("INSERT INTO notes(id,owner,language,original,created_at,updated_at,request_hash) VALUES('n','qa','sq','Synthetic original','date','date','hash')")
 d.commit();return d
def notes(d):return d.execute('SELECT * FROM notes').fetchall()
def atomic(d,statements):
 try:
  d.execute('BEGIN')
  for s,a in statements:d.execute(s,a)
  d.commit()
 except Exception:
  d.rollback();raise
def record(d,id,kind,data,parent=None):
 d.execute('INSERT INTO tutor_records(id,owner,kind,parent_id,data,request_hash,created_at) VALUES(?,?,?,?,?,?,?)',(id,'qa',kind,parent,json.dumps(data),'hash','date'));d.commit()
def apply(id,version=1):return (v['apply'],('now',id,'qa',version))
d=previous();before=notes(d)
try:
 atomic(d,[(s,()) for s in parts(v['old'])])
 raise AssertionError('old trigger unexpectedly split safely')
except sqlite3.Error as e:ok('incomplete input' in str(e),'reproduce incomplete trigger SQL')
ok(not d.execute("SELECT name FROM sqlite_master WHERE name='tutor_records'").fetchone(),'failed migration rolled back')
ok(notes(d)==before,'failed migration preserves earlier notes')
for separator in [';','--> statement-breakpoint']:
 d=previous();before=notes(d)
 atomic(d,[(s,()) for s in parts(v['migrations'][3],separator)])
 ok(notes(d)==before,'new migration over previous schema preserves notes')
 ok(d.execute('PRAGMA table_info(tutor_records)').fetchall()[6][1]=='apply_guard','CHECK guard column exists')
 ok(not d.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall(),'no trigger statements to split')
 ok('tutor_apply_guard_check' in d.execute("SELECT sql FROM sqlite_master WHERE name='tutor_records'").fetchone()[0],'CHECK exists in migrated schema')
record(d,'p','preparation',{'references':[{'noteId':'n','expectedVersion':1}]})
atomic(d,[apply('p')]);ok(d.execute("SELECT state,version,apply_guard FROM tutor_records WHERE id='p'").fetchone()==('applied',2,1),'valid preparation atomically applied')
record(d,'stale','preparation',{'references':[{'noteId':'n','expectedVersion':2}]})
try:atomic(d,[apply('stale')]);raise AssertionError('stale source accepted')
except sqlite3.IntegrityError as e:ok('tutor_apply_guard_check' in str(e),'stale source trips CHECK')
ok(d.execute("SELECT state,version FROM tutor_records WHERE id='stale'").fetchone()==('proposed',1),'stale preparation retained')
record(d,'foreign','preparation',{'references':[{'noteId':'n','expectedVersion':1}]});d.execute("UPDATE notes SET owner='other' WHERE id='n'");d.commit()
try:atomic(d,[apply('foreign')]);raise AssertionError('foreign source accepted')
except sqlite3.IntegrityError:ok(True,'ownership checked inside atomic validation')
d.execute("UPDATE notes SET owner='qa' WHERE id='n'");d.commit()
for id in ['c1','c2']:record(d,id,'closing',{'expectedPreparationVersion':2,'changes':[]},'p')
advance=("UPDATE tutor_records SET version=version+1 WHERE id='p' AND owner='qa' AND version=2",())
atomic(d,[apply('c1'),advance]);ok(d.execute("SELECT version FROM tutor_records WHERE id='p'").fetchone()[0]==3,'empty closing advances parent once')
try:atomic(d,[apply('c2'),advance]);raise AssertionError('competing closure accepted')
except sqlite3.IntegrityError:ok(True,'competing empty closure rejected')
ok(d.execute("SELECT state,version FROM tutor_records WHERE id='c2'").fetchone()==('proposed',1),'competing closure remains proposed')
record(d,'c3','closing',{'expectedPreparationVersion':3,'changes':[{'noteId':'n','expectedVersion':1}]},'p')
before=notes(d)
try:
 atomic(d,[apply('c3'),("UPDATE notes SET clarified='first write',version=2 WHERE id='n'",()),("INSERT INTO revisions(id,owner,note_id,version,content,created_at) VALUES(NULL,'qa','n',2,'x','now')",())])
 raise AssertionError('failing second write accepted')
except sqlite3.IntegrityError:ok(True,'late failure aborts transaction')
ok(notes(d)==before,'prior note write rolls back after late failure')
ok(d.execute("SELECT state,version FROM tutor_records WHERE id='c3'").fetchone()==('proposed',1),'record approval rolls back after late failure')
ok(d.execute("SELECT version FROM tutor_records WHERE id='p'").fetchone()[0]==3,'parent remains unchanged after failure')
d.execute("UPDATE notes SET version=2 WHERE id='n'");d.commit()
try:atomic(d,[apply('c3')]);raise AssertionError('stale changed note accepted')
except sqlite3.IntegrityError:ok(True,'changed target trips CHECK before revisions')
print(json.dumps({'passed':checks,'old_trigger_split_error':'incomplete input','new_migration_split_modes':['semicolon','drizzle-breakpoint'],'rollback':'verified','scope':'In-memory SQLite, prior schema and synthetic note only'}))
`;
const result=spawnSync('python3',['-c',py],{input:JSON.stringify({migrations,old,apply:tutorApplySql}),encoding:'utf8'});assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);await writeFile('.sites-runtime/evidence/tutor-migration-validation.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
