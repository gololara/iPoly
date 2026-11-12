import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {build} from 'esbuild';
import './local-evidence.mjs';
const file=resolve('.sites-runtime/evidence/class-memory-removal-ui.cjs');
await build({entryPoints:['components/class-memory-removal.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/*','react-dom','react-dom/*'],outfile:file,logLevel:'error'});
const source=await readFile(file,'utf8'),require=createRequire(import.meta.url),results=[];
const all=n=>!n||typeof n!=='object'?[]:[n,...(Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).flatMap(all)];
const text=n=>typeof n==='string'?n:!n||typeof n!=='object'?'':(Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).map(text).join('');
function harness(storage=new Map()){
 const states=[],effects=[],pendingEffects=[],calls=[],saved=[];let cursor=0,lose=false;
 const props={viewerId:'synthetic-ui-owner',current:{id:'40000000-0000-4000-8000-000000000001',version:3},note:{noteId:'50000000-0000-4000-8000-000000000001',noteVersion:2,title:'Memoria sintética',removalBlockedReason:null},disabled:false,onBusy(b){props.disabled=b;},onRemoved(next){saved.push(next);},async onRefresh(){}};
 const react={...React,useContext(){return 'es';},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i][j])){effects[i]=deps;pendingEffects.push(fn);}}};
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,require:n=>n==='react'?react:require(n),process:{env:{NODE_ENV:'test'}},console,crypto:globalThis.crypto,setTimeout,clearTimeout,URL,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(path,options)=>{calls.push({path,method:options.method,body:JSON.parse(options.body)});if(lose){lose=false;throw Error('Synthetic response lost after submission');}return {ok:true,json:async()=>({id:props.current.id,version:4,memories:[]})};}});
 const render=()=>{cursor=0;let tree=mod.exports.ClassMemoryRemoval(props);if(pendingEffects.length){for(const fn of pendingEffects.splice(0))fn();cursor=0;tree=mod.exports.ClassMemoryRemoval(props);}return tree;};
 const buttons=label=>all(render()).filter(n=>typeof n.props?.onClick==='function'&&text(n)===label);
 async function click(label,last=false){const matches=buttons(label),button=last?matches.at(-1):matches[0];assert.ok(button,'Button exists '+label);assert.ok(!button.props.disabled,'Button enabled '+label);button.props.onClick();await new Promise(setImmediate);}
 return {props,render,click,calls,saved,storage,buttons,loseNext(){lose=true;}};
}
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}}
await check('cancel before confirmation sends nothing and stores no command',async()=>{const h=harness();await h.click('Quitar de esta clase');await h.click('Conservar en la clase');assert.equal(h.calls.length,0);assert.equal(h.storage.size,0);});
await check('confirmation pins class/note versions and IDs even if parent refreshes',async()=>{const h=harness();await h.click('Quitar de esta clase');h.props.current={...h.props.current,version:9};h.props.note={...h.props.note,noteVersion:7};await h.click('Quitar de esta clase',true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.expectedVersion,3);assert.equal(h.calls[0].body.expectedNoteVersion,2);assert.equal(h.calls[0].body.confirmed,true);assert.equal(h.saved.length,1);});
await check('lost response retries the identical command and clears receipt only after acknowledgement',async()=>{const h=harness();await h.click('Quitar de esta clase');h.loseNext();await h.click('Quitar de esta clase',true);assert.equal(h.storage.size,1);h.props.current={...h.props.current,version:12};h.props.note={...h.props.note,noteVersion:8};await h.click('Comprobar solicitud');assert.deepEqual(h.calls[1],h.calls[0]);assert.equal(h.saved.length,1);assert.equal(h.storage.size,0);});
await check('reload restores an uncertain command without automatically sending it',async()=>{const first=harness();await first.click('Quitar de esta clase');first.loseNext();await first.click('Quitar de esta clase',true);const second=harness(first.storage);second.props.current={...second.props.current,version:20};second.render();assert.equal(second.calls.length,0);await second.click('Comprobar solicitud');assert.deepEqual(second.calls[0],first.calls[0]);});
await check('protected tutor work has an explicit reason and no removal submit',async()=>{const h=harness();h.props.note={...h.props.note,removalBlockedReason:'Tiene aportes del maestro; se conserva su contexto.'};await h.click('Quitar de esta clase');assert.ok(text(h.render()).includes('Tiene aportes del maestro'));assert.equal(h.buttons('Quitar de esta clase').length,1);assert.equal(h.buttons('Comprobar solicitud').length,0);await h.click('Volver a la clase');assert.equal(h.calls.length,0);});
await check('closing an uncertain request promises no rollback and preserves the retry command',async()=>{const h=harness();await h.click('Quitar de esta clase');h.loseNext();await h.click('Quitar de esta clase',true);assert.ok(text(h.render()).includes('Cerrar no revierte'));await h.click('Cerrar');assert.equal(h.storage.size,1);await h.click('Quitar de esta clase');await h.click('Comprobar solicitud');assert.deepEqual(h.calls[0],h.calls[1]);});
await check('failed recovery retains the exact pending command for a later read or retry',async()=>{const h=harness();await h.click('Quitar de esta clase');h.loseNext();await h.click('Quitar de esta clase',true);h.props.onRefresh=async()=>{throw Error('Synthetic read unavailable');};await h.click('Recuperar estado de la clase');assert.equal(h.storage.size,1);assert.equal(h.calls.length,1);assert.ok(text(h.render()).includes('Synthetic read unavailable'));});
const report={syntheticOnly:true,production:false,externalRequests:0,actualComponentHandlers:true,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
await writeFile('.sites-runtime/evidence/class-memory-removal-ui.json',JSON.stringify(report,null,2)+'\n');console.log(report);if(report.failed)process.exitCode=1;
