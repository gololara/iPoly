import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rememberClassPosition,classNoteLabel} from '../lib/class-session-ui.ts';

test('recovering committed note10 replaces note9 in persistent class position',()=>{
 const values=new Map(),storage={setItem:(k,v)=>values.set(k,v)};
 rememberClassPosition(storage,'class-A',{active:'note9',opened:true,returnPosition:497.5});
 rememberClassPosition(storage,'class-B',{active:'other-note',opened:false,returnPosition:0});
 // Same writer is used by ordinary navigation, successful add and lost-response recovery.
 rememberClassPosition(storage,'class-A',{active:'note10',opened:true,returnPosition:497.5});
 assert.deepEqual(JSON.parse(values.get('ipoly.class-position.class-A')),{active:'note10',opened:true,returnPosition:497.5});
 assert.equal(JSON.parse(values.get('ipoly.class-position.class-B')).active,'other-note');
});
test('blocked position storage is reported to the caller for its in-memory fallback',()=>{
 assert.throws(()=>rememberClassPosition({setItem(){throw Error('blocked')}},'class-A',{active:'note10',opened:true,returnPosition:0}),/blocked/);
});
test('closing choices have original-list ordinal and recognizable private source fragment',()=>{
 const first={snapshot:{title:'',original:'First\n synthetic   original',clarified:'previous'}};
 const second={snapshot:{title:'',original:'Second source',clarified:'previous'}};
 assert.equal(classNoteLabel(first,0),'1. First synthetic original');
 assert.equal(classNoteLabel(second,6),'7. Second source');
 assert.notEqual(classNoteLabel(first,0),classNoteLabel(second,6));
 assert.equal(classNoteLabel({snapshot:{title:'Descriptive title',original:'private source',clarified:''}},2),'3. Descriptive title');
});
test('attachment-only notes remain identifiable and long labels are bounded',()=>{
 assert.equal(classNoteLabel({snapshot:{title:'',original:'',clarified:''}},9),'10. Nota con adjuntos');
 assert.ok(classNoteLabel({snapshot:{title:'',original:'x'.repeat(200),clarified:''}},0).length<=93);
});
