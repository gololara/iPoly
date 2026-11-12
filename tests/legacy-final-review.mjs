import {assertRetainedMcpContract} from './mcp-chat-contract.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import React from 'react';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import './local-evidence.mjs';
const directory='.sites-runtime/evidence/legacy-final-review';
await (await import('node:fs/promises')).mkdir(directory,{recursive:true});
const results=[];
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}}

// Execute the actual component handlers with React element creation and a small
// hook-state host. No duplicated save algorithm, DOM emulator or real network.
const file=resolve(directory,'metadata.cjs');
await build({entryPoints:['components/memory-metadata.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/*','react-dom','react-dom/*'],outfile:file,logLevel:'error'});
const require=createRequire(import.meta.url),componentSource=await readFile(file,'utf8');
function harness(){
 const state=[],calls=[];let cursor=0,lose=false,saved=0;
 const react={...React,useContext(){return 'es';},useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];}};
 const box={exports:{}};
 vm.runInNewContext(componentSource,{module:box,exports:box.exports,require:name=>name==='react'?react:require(name),console,crypto:globalThis.crypto,process:{env:{NODE_ENV:'test'}},setTimeout,clearTimeout,URL,fetch:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});if(lose){lose=false;throw Error('Synthetic uncertain response after submission');}return {ok:true,json:async()=>({})};}});
 const Component=box.exports.MemoryMetadata;
 let memory={note:{id:'70000000-0000-4000-8000-000000000001',version:1,clarified:'Opening clarification',title:'Opening title',tags:[{id:'one',name:'Opening tag'}]}};
 const render=()=>{cursor=0;return Component({memory,enabled:true,onSaved(){saved++;}});};
 const all=node=>!node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(all)];
 const text=node=>typeof node==='string'?node:!node||typeof node!=='object'?'':(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).map(text).join('');
 const button=(tree,label)=>{const element=all(tree).find(n=>typeof n.props?.onClick==='function'&&text(n)===label);assert.ok(element,'Button exists: '+label);return element.props.onClick;};
 const open=()=>button(render(),'Título y etiquetas')();
 const edit=()=>{const label=all(render()).find(n=>n.type==='label'&&text(n).startsWith('Título · opcional'));const input=all(label).find(n=>typeof n.props?.onChange==='function');input.props.onChange({target:{value:'Explicit metadata edit'}});};
 return {open,edit,calls,replace(){memory={note:{...memory.note,version:2,clarified:'Concurrent clarification',title:'Concurrent title',tags:[{id:'two',name:'Concurrent tag'}]}};},loseNext(){lose=true;},async save(){button(render(),'Guardar título y etiquetas')();await new Promise(setImmediate);},get saved(){return saved;}};
}
await check('metadata approval stays bound to the version and clarification shown on opening',async()=>{
 const h=harness();h.open();h.edit();h.replace();await h.save();assert.equal(h.calls[0].body.expectedVersion,1);assert.equal(h.calls[0].body.clarified,'Opening clarification');assert.deepEqual(h.calls[0].body.tags,['Opening tag']);assert.equal(h.calls[0].body.title,'Explicit metadata edit');
});
await check('uncertain metadata response retries the exact command even when parent data refreshes',async()=>{
 const h=harness();h.open();h.edit();h.loseNext();await h.save();h.replace();await h.save();assert.deepEqual(h.calls[1],h.calls[0]);assert.equal(h.saved,1);
});

const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
let external=0;const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false,outboundService:()=>{external++;return new Response('Blocked',{status:502});}});
try{
 await check('MCP contracts preserve historical tools and approvals, widening only capture and search languages',async()=>{
  const response=await mf.dispatchFetch('http://localhost/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  assertRetainedMcpContract((await response.json()).result.tools);
 });
 for(const path of ['/clases?language=en&preparation=40000000-0000-4000-8000-000000000013','/clases?language=sq&class=40000000-0000-4000-8000-000000000014','/memorias?language=en&archive=debriefs','/memorias/70000000-0000-4000-8000-000000000001?class=40000000-0000-4000-8000-000000000014'])await check('sign-in preserves exact deep-link context: '+path,async()=>{
  const response=await mf.dispatchFetch('http://localhost'+path,{redirect:'manual'});assert.ok(response.status>=300&&response.status<400);const location=new URL(response.headers.get('location'),'http://localhost');assert.equal(location.pathname,'/signin-with-chatgpt');assert.equal(location.searchParams.get('return_to'),path);
 });
}finally{await mf.dispose();}
assert.equal(external,0);
const report={syntheticOnly:true,production:false,externalRequests:external,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
await writeFile(directory+'/result.json',JSON.stringify(report,null,2)+'\n');console.log(report);if(report.failed)process.exitCode=1;
