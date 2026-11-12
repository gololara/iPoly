import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
// Test-only binding for deterministic races/query instrumentation. Real SQL and
// authorization remain covered by the built-Worker/D1 integration suites.
const binding='data:text/javascript,'+encodeURIComponent(`
 export class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
 export const uuid={parse:value=>value};
 export const database=()=>globalThis.__memoryProjection.db;
 export const getNote=async()=>structuredClone(globalThis.__memoryProjection.note);
`);
registerHooks({resolve(specifier,context,next){if(specifier==='./data'&&context.parentURL===new URL('../lib/memory-read.ts',import.meta.url).href)return {url:binding,shortCircuit:true};return next(specifier,context);}});
const {readMemory}=await import('../lib/memory-read.ts');
const at='2026-01-01T00:00:00.000Z',owner='synthetic-projection-owner',noteId='00000000-0000-4000-8000-000000000001';
function fixture(){
 const note={id:noteId,language:'en',original:'Synthetic original',clarified:'',title:'',created_at:at,updated_at:at,version:1,reviewed:0,tags:[],attachments:[]};
 const rows=[[{version:1,reviewed:0}],[],[],[],[],[{total:0,version:0,ledger_valid:1}],[]],calls=[];
 const state={note,rows,calls,batches:0,db:{prepare(sql){assert.match(sql,/^SELECT\b/);const q={sql,bind(...args){q.args=args;return q;}};calls.push(q);return q;},async batch(statements){state.batches++;assert.equal(statements.length,7);return rows.map(results=>({results:structuredClone(results)}));}}};
 globalThis.__memoryProjection=state;return state;
}
const contribution=i=>({id:'synthetic-'+i,kind:'addition',text:'Synthetic '+i,context:'',author_role:'user',author_id:owner,author_name:null,recorder_role:null,recorded_by:null,recorder_name:null,class_id:null,created_at:at,applied_at:at});
test('one SELECT-only batch and constant query count for 500 contributions',async()=>{
 const s=fixture();const small=await readMemory(owner,noteId);assert.equal(small.entries.length,1);assert.equal(s.calls.length,7);
 s.calls.length=0;s.rows[3]=Array.from({length:500},(_,i)=>contribution(i));const large=await readMemory(owner,noteId);assert.equal(s.calls.length,7);assert.equal(s.batches,2);assert.equal(large.entries.length,501);assert.equal(new Set(large.entries.map(e=>e.id)).size,501);assert.deepEqual(await readMemory(owner,noteId),large);
});
test('changed version, changed approval or missing note rejects a mixed read',async()=>{
 for(const row of [{version:2,reviewed:0},{version:1,reviewed:1},undefined]){const s=fixture();s.rows[0]=row?[row]:[];await assert.rejects(readMemory(owner,noteId),e=>e.status===409);}
});
test('revision and applied source are represented once, with no guessed author',async()=>{
 const s=fixture(),d={id:'synthetic-debrief',created_at:at,applied_at:at,clarified:'Approved synthetic',title:null,expected_version:1};
 s.rows[1]=[d];s.rows[2]=[{id:d.id+':'+noteId,version:2,content:JSON.stringify({after:{noteId,clarified:d.clarified}}),created_at:at}];
 const m=await readMemory(owner,noteId);assert.equal(m.entries.filter(e=>e.source.debriefId===d.id).length,1);assert.equal(m.entries[1].author.role,'unknown');
 s.rows[2][0].content=JSON.stringify({after:{noteId,clarified:'Conflicting applied source'}});await assert.rejects(readMemory(owner,noteId),e=>e.status===409);
});
test('invalid dates and ambiguous repeated applied sources fail explicitly',async()=>{
 const s=fixture();s.rows[3]=[{...contribution(1),created_at:'not-a-date'}];await assert.rejects(readMemory(owner,noteId),e=>e.status===409);
 s.rows[3]=[];const d={id:'duplicate-source',created_at:at,applied_at:at,clarified:'Synthetic',title:null,expected_version:1};s.rows[1]=[d,d];await assert.rejects(readMemory(owner,noteId),e=>e.status===409);
});
