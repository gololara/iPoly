import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {z} from 'zod';
// Only the shared UUID validator is needed in this Node-only contract test.
globalThis.__memoryContractUuid=z.string().uuid();
registerHooks({resolve(specifier,context,next){if(specifier==='./data'&&context.parentURL===new URL('../lib/memory-contract.ts',import.meta.url).href)return {url:'data:text/javascript,export const uuid=globalThis.__memoryContractUuid;',shortCircuit:true};return next(specifier,context);}});
const {canonical,proposeMemorySchema,applyMemorySchema,memoryDecisionSchema}=await import('../lib/memory-contract.ts');
const id='00000000-0000-4000-8000-000000000001',noteId='00000000-0000-4000-8000-000000000002',draft={id,noteId,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'addition',text:'Synthetic original\nNjë sqarim',author:{role:'ai'}};
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
test('approval hash ignores object key order, preserves exact Unicode/newlines',()=>{
 const a={id,proposalVersion:1,content:{text:draft.text,version:1,actor:{role:'ai',id:null}}},b={content:{actor:{id:null,role:'ai'},version:1,text:draft.text},proposalVersion:1,id};assert.equal(hash(a),hash(b));assert.equal(JSON.parse(canonical(a)).content.text,draft.text);assert.notEqual(hash(a),hash({...a,content:{...a.content,text:draft.text+' '}}));assert.notEqual(hash(a),hash({...a,proposalVersion:2}));assert.notEqual(hash(a),hash({...a,id:noteId}));
});
test('reviewed array order and null metadata remain bound to the hash',()=>{assert.notEqual(hash({attachments:['a','b']}),hash({attachments:['b','a']}));assert.notEqual(hash({speaker:null}),hash({}));});
test('proposal boundary rejects owner injection, invalid versions and unbounded payloads',()=>{
 assert(proposeMemorySchema.safeParse(draft).success);for(const x of [{...draft,owner:'foreign'},{...draft,expectedNoteVersion:0},{...draft,expectedMemoryVersion:-1},{...draft,text:'x'.repeat(30001)},{...draft,attachments:Array.from({length:6},()=>({attachmentId:id}))}])assert.equal(proposeMemorySchema.safeParse(x).success,false);
});
test('approval/cancellation requires explicit literal confirmation and reviewed content',()=>{
 const decision={id,proposalVersion:1,contentHash:'a'.repeat(64),confirmed:true};assert(memoryDecisionSchema.safeParse(decision).success);assert.equal(memoryDecisionSchema.safeParse({...decision,confirmed:'true'}).success,false);assert.equal(memoryDecisionSchema.safeParse({...decision,confirmed:false}).success,false);assert.equal(applyMemorySchema.safeParse(decision).success,false);assert.equal(memoryDecisionSchema.safeParse({...decision,proposalVersion:2}).success,false);
});
