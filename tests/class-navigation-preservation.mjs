import './local-evidence.mjs';
import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
const headers={'oai-authenticated-user-id':'qa-tutor-history-ui','oai-authenticated-user-email':'qa-tutor-history-ui@example.test'};let passed=0;const ok=(v,m)=>{assert.ok(v,m);passed++;};
const get=async path=>{const r=await fetch('http://127.0.0.1:8788/api/'+path,{headers});assert.equal(r.status,200);return r.json();};
const list=await get('preparations');ok(list.preparations.length===2,'navigation creates no new preparation');
const current=await get('preparations/40000000-0000-4000-8000-000000000013');ok(current.preparation.state==='applied'&&current.preparation.version===2,'existing preparation not reapplied');ok(current.thread.version===1&&current.history.length===3&&current.events.length===0,'navigation does not revise or organize history');ok(current.closings.length===0,'navigation creates no closing');
for(const suffix of ['11','12']){const r=await get('preparations/40000000-0000-4000-8000-0000000000'+suffix);ok(r.preparation.state==='proposed'&&r.preparation.version===1,'historical draft preserved');}
const english=await get('preparations/90000000-0000-4000-8000-000000000001');ok(english.preparation.state==='proposed'&&english.preparation.version===1&&!english.thread,'distinct class remains separate');
const notes=await get('notes');ok(notes.notes.length===2&&notes.notes.every(n=>n.version===2)&&notes.notes.some(n=>n.original==='Original sintético')&&notes.notes.some(n=>n.original==='English synthetic original'),'navigation does not alter notes');
const out={passed,scope:'Read-only verification after browser QA against synthetic local fixtures only'};await writeFile('.sites-runtime/evidence/class-navigation-preservation.json',JSON.stringify(out,null,2));console.log(out);
