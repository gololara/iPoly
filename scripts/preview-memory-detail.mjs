import {seedAttributionPreview} from './attribution-fixture.mjs';
import {createServer} from 'node:http';
import {Miniflare} from 'miniflare';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {seedMemoryDetail,fixtureHeaders,memoryFixture as f} from './memory-detail-fixture.mjs';
const flags=new Set(process.argv.slice(3));if([...flags].some(f=>!['--capture','--long-list','--attribution','--refactor','--history'].includes(f)))throw Error('Unknown synthetic preview flag');
const refactorPreview=flags.has('--refactor');
const capturePreview=flags.has('--capture'),longListPreview=flags.has('--long-list');
const port=Number(process.argv[2]??8897);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a local test port');
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
let externalRequests=0;const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},assetConfig:{html_handling:'none',not_found_handling:'none'}},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false,outboundService:()=>{externalRequests++;return new Response('External networking disabled',{status:502});}});
await seedMemoryDetail(mf);
let simpleClassPreview=null;
if(refactorPreview){
 const classId='74000000-0000-4000-8000-000000000001';
 const request=async(path,body)=>{const r=await mf.dispatchFetch('http://localhost/api/'+path,{method:'POST',headers:{...fixtureHeaders,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Synthetic class fixture failed: '+r.status);return r.json();};
 const c=await request('classes',{id:classId,language:'sq',title:'Clase de hoy',memories:[{noteId:f.empty,expectedVersion:1},{noteId:f.rich,expectedVersion:1}]});
 await request('class-memory-reviewed',{classId,expectedVersion:c.version,requestId:'74000000-0000-4000-8000-000000000002',noteId:f.empty,expectedNoteVersion:1,reviewed:true});simpleClassPreview=classId;
}
const attributionPreview=flags.has('--attribution')?await seedAttributionPreview(mf,f.owner):null;
if(longListPreview){
 const db=await mf.getD1Database('DB');
 for(let i=1;i<=8;i++){
  const id='73000000-0000-4000-8000-'+String(i).padStart(12,'0'),at='2026-10-19T10:'+String(i).padStart(2,'0')+':00.000Z';
  await db.prepare('INSERT INTO notes(id,owner,language,original,title,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,f.owner,'sq','Un recuerdo sintético para comprobar el recorrido de una lista larga y la captura rápida.','Recuerdo de prueba '+i,id,at,at).run();
 }
}
let historicalPreview=null;
if(flags.has('--history')){
 const db=await mf.getD1Database('DB'),preparation='75000000-0000-4000-8000-000000000001',older='75000000-0000-4000-8000-000000000002',thread='75000000-0000-4000-8000-000000000003',draft='75000000-0000-4000-8000-000000000004',closing='75000000-0000-4000-8000-000000000005',at='2026-01-01T10:00:00Z';
 const refs=[];for(const id of [f.rich,f.empty]){const r=await mf.dispatchFetch('http://localhost/api/notes/'+id,{headers:fixtureHeaders});const n=(await r.json()).note;refs.push({noteId:id,expectedVersion:n.version,snapshot:n});}
 const data={language:'sq',title:'Preparación sintética',summary:'Vivencias y dudas para dar contexto al maestro. Llevar estas memorias no significa haberlas trabajado.',references:refs};
 for(const [id,state,title]of [[older,'applied','Revisión anterior sintética'],[preparation,'applied','Contexto de la clase sintética'],[draft,'proposed','Propuesta sintética pendiente']])await db.prepare('INSERT INTO tutor_records(id,owner,kind,state,data,request_hash,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,f.owner,'preparation',state,JSON.stringify({...data,title}),id,at,state==='applied'?at:null).run();
 await db.prepare('INSERT INTO tutor_threads(id,owner,language,current_preparation_id,version,request_hash,created_at) VALUES(?,?,?,?,1,?,?)').bind(thread,f.owner,'sq',preparation,thread,at).run();
 for(const id of [older,preparation])await db.prepare('INSERT INTO tutor_thread_members(preparation_id,thread_id,owner,created_at) VALUES(?,?,?,?)').bind(id,thread,f.owner,at).run();
 await db.prepare('INSERT INTO tutor_records(id,owner,kind,parent_id,state,data,request_hash,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(closing,f.owner,'closing',preparation,'applied',JSON.stringify({...data,reported:'Relato de ejemplo: solo se trabajó una memoria. La otra queda pendiente.',practice:'Repaso histórico conservado.',changes:[]}),closing,at,at).run();
 await db.prepare('INSERT INTO debriefs(id,owner,summary,changes,state,created_at) VALUES(?,?,?,?,?,?)').bind('75000000-0000-4000-8000-000000000006',f.owner,'Debriefing sintético pendiente',JSON.stringify([{noteId:f.empty,expectedVersion:1,clarified:'Texto pendiente de revisión.',tags:['Vida diaria']}]),'proposed',at).run();
 historicalPreview={preparation,older,thread,draft};
}

const origin='http://127.0.0.1:'+port;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url??'/',origin);if(url.origin!==origin){res.writeHead(400);res.end();return;}
  const historyWrite=flags.has('--history')&&((req.method==='POST'&&['/api/debriefs/apply','/api/tutor/apply','/api/preparations/group'].includes(url.pathname))||(req.method==='PATCH'&&url.pathname==='/api/notes'));
  const refactorWrite=refactorPreview&&((req.method==='POST'&&['/api/classes','/api/class-memories','/api/class-memory-reviewed','/api/class-memory-removal','/api/class-session-state','/api/simple-class-teacher','/api/memory-proposals','/api/memory-approval','/api/memory-cancellation','/api/memory-uploads','/api/teachers'].includes(url.pathname))||(req.method==='PATCH'&&['/api/teachers','/api/class-teacher'].includes(url.pathname))||(req.method==='DELETE'&&/^\/api\/memory-uploads\/[0-9a-f-]{36}$/i.test(url.pathname)));
  const captureWrite=capturePreview&&((req.method==='POST'&&['/api/notes','/api/uploads','/api/audio-uploads'].includes(url.pathname))||(req.method==='DELETE'&&/^\/api\/uploads\/[0-9a-f-]{36}$/i.test(url.pathname)));
  if(!['GET','HEAD'].includes(req.method??'')&&!captureWrite&&!refactorWrite&&!historyWrite){res.writeHead(405,{'Content-Type':'application/json','Cache-Control':'no-store',Allow:'GET, HEAD'});res.end(JSON.stringify({error:'Synthetic preview is read-only'}));return;}
  if(url.pathname==='/sw.js'){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
  if(url.pathname==='/api/memories/'+f.interrupted){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Synthetic unavailable read'}));return;}
  // Never forward browser cookies, credentials or incoming identity headers.
  const headers=new Headers(fixtureHeaders);for(const key of ['accept','accept-language','range','content-type']){const value=req.headers[key];if(typeof value==='string')headers.set(key,value);}
  let body;if(captureWrite||refactorWrite||historyWrite){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>30*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
  const r=await mf.dispatchFetch('http://localhost'+url.pathname+url.search,{method:req.method,headers,redirect:'manual',...(body?{body}:{})});res.writeHead(r.status,Object.fromEntries(r.headers));if(req.method==='HEAD')res.end();else res.end(Buffer.from(await r.arrayBuffer()));
 }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Synthetic preview could not serve this read'}));}
});
server.once('error',async e=>{console.error(e.code??'preview error');await mf.dispose();process.exitCode=1;});
await new Promise((resolve,reject)=>{server.listen(port,'127.0.0.1',resolve);server.once('error',reject);});
const manifest={...(historicalPreview?{historicalPreview}:{}),...(simpleClassPreview?{class:origin+'/clases?language=sq&class='+simpleClassPreview}:{}),...(attributionPreview?{attributionBefore:origin+'/memorias/'+attributionPreview.before,attributionAfter:origin+'/memorias/'+attributionPreview.after}:{}),origin,url:origin+'/memorias/'+f.rich,empty:origin+'/memorias/'+f.empty,unknown:origin+'/memorias/'+f.unknown,missing:origin+'/memorias/'+f.missing,interrupted:origin+'/memorias/'+f.interrupted,pid:process.pid,syntheticOnly:true,readOnlyHTTP:!capturePreview&&!refactorPreview&&!flags.has('--history'),refactorWritesSyntheticOnly:refactorPreview,captureWritesSyntheticOnly:capturePreview,list:origin+'/memorias?language=sq',ephemeralD1:true,ephemeralR2:true,longListSynthetic:longListPreview,externalRequests,production:false};
await mkdir('.sites-runtime/memory-detail',{recursive:true});await writeFile('.sites-runtime/memory-detail/preview.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await mf.dispose();process.exit(0);});});
