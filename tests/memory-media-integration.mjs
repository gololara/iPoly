import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import './local-evidence.mjs';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
let externalRequests=0;const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false,outboundService:()=>{externalRequests++;return new Response('Blocked',{status:502});}});
const A='synthetic-memory-media-a',B='synthetic-memory-media-b',at='2026-01-01T00:00:00Z',uid=()=>crypto.randomUUID();let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const headers=owner=>owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test'}:{};
async function req(path,method='GET',body,owner=A){const isForm=body instanceof FormData;let payload=body===undefined?undefined:JSON.stringify(body),extra={'Content-Type':'application/json'};if(isForm){const encoded=new Request('http://localhost',{method:'POST',body});payload=await encoded.arrayBuffer();extra={'Content-Type':encoded.headers.get('content-type')};}return mf.dispatchFetch('http://localhost/api/'+path,{method,headers:{...headers(owner),...extra},...(payload===undefined?{}:{body:payload})});}
async function api(path,method='GET',body,owner=A,status=200){const r=await req(path,method,body,owner);equal(r.status,status);return r.status===204?null:r.json();}
const decision=p=>({id:p.id,proposalVersion:p.proposalVersion,contentHash:p.contentHash,confirmed:true,approvedContent:p.content});
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const note=async(owner=A)=>{const id=uid();await db.prepare('INSERT INTO notes(id,owner,language,original,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'en','Synthetic immutable capture',id,at,at).run();return id;};
 const n=await note(),other=await note(),foreign=await note(B),image=await readFile('public/icon-192.png'),sound=await readFile('tests/fixtures/synthetic.m4a');
 const before=(await api('memories/'+n)).memory.note;
 const form=(noteId,id,kind,bytes=image)=>{const f=new FormData();f.set('noteId',noteId);f.set('id',id);f.set('kind',kind);f.set('origin','personal');f.set('file',new Blob([bytes]),kind==='photo'?'synthetic.png':'synthetic.m4a');return f;};
 const photo=uid(),audio=uid(),consent=new Date(Date.now()-1000).toISOString();
 await api('memory-uploads','POST',form(foreign,uid(),'photo'),A,404);await api('memory-uploads','POST',form(n,uid(),'photo'),null,401);await api('memory-uploads','POST',form(n,uid(),'photo',new Uint8Array(30)),A,400);await api('memory-uploads','POST',form(n,uid(),'audio',new Uint8Array(30)),A,400);
 const uploaded=await api('memory-uploads','POST',form(n,photo,'photo'),A,201);equal(uploaded.id,photo);await api('memory-uploads','POST',form(n,photo,'photo'),A,201);
 await api('memory-uploads','POST',form(other,photo,'photo'),A,409);await api('memory-uploads','POST',form(n,audio,'audio',sound),A,201);
 equal((await req('files/'+photo)).status,404);equal((await req('memory-upload-previews/'+photo)).status,200);equal((await req('memory-upload-previews/'+photo,'GET',undefined,B)).status,404);
 equal((await api('memories/'+n)).memory.note,before);
 const body={id:uid(),noteId:n,expectedNoteVersion:1,expectedMemoryVersion:0,kind:'exercise',text:'Synthetic approved image and audio',author:{role:'user'},attachments:[{attachmentId:photo},{attachmentId:audio,speaker:{role:'user'},recordedBy:{role:'user'},recordingPermission:{confirmed:true,obtainedAt:consent}}]};
 const p=(await api('memory-proposals','POST',body,A,201)).proposal;
 equal(p.content.attachments[0].media.origin,'personal');
 equal((await api('memory-proposals?noteId='+n)).proposals.map(p=>p.id),[p.id]);await api('memory-proposals?noteId='+n,'GET',undefined,B,404);
 await api('memory-uploads/'+photo,'DELETE',undefined,A,409);equal((await api('memories/'+n)).memory.entries.length,1);
 const changed={...decision(p),approvedContent:{...p.content,attachments:[...p.content.attachments].reverse()}};await api('memory-approval','POST',changed,A,409);
 const applied=(await api('memory-approval','POST',decision(p))).proposal;equal(applied.state,'applied');await api('memory-approval','POST',decision(p));
 const m=(await api('memories/'+n)).memory;equal(m.note,before);equal(m.entries.find(e=>e.source.id===p.id).attachments.map(a=>a.id),[photo,audio]);equal(m.entries.find(e=>e.source.id===p.id).attachments[1].speaker.id,A);equal(m.contributionVersion,1);
 for(const [id,bytes]of [[photo,image],[audio,sound]]){const r=await req('files/'+id);equal(r.status,200);equal(Buffer.from(await r.arrayBuffer()),bytes);equal((await req('files/'+id,'GET',undefined,B)).status,404);await api('memory-uploads/'+id,'DELETE',undefined,A,409);}
 equal((await api('memories/'+n)).memory.note,before);equal((await db.prepare('SELECT count(*) total FROM attachments WHERE note_id=? AND included=1').bind(n).first()).total,0);
 const cancelPhoto=uid();await api('memory-uploads','POST',form(n,cancelPhoto,'photo'),A,201);const cancelled=(await api('memory-proposals','POST',{...body,id:uid(),expectedMemoryVersion:1,attachments:[{attachmentId:cancelPhoto}]},A,201)).proposal;
 await api('memory-cancellation','POST',{id:cancelled.id,proposalVersion:1,contentHash:cancelled.contentHash,confirmed:true});await api('memory-uploads/'+cancelPhoto,'DELETE',undefined,A,204);equal((await req('memory-upload-previews/'+cancelPhoto)).status,404);equal((await req('files/'+cancelPhoto)).status,404);
 const concurrent=uid();const races=await Promise.all([req('memory-uploads','POST',form(n,concurrent,'photo')),req('memory-uploads','POST',form(n,concurrent,'photo',Buffer.concat([image,Buffer.from('different')])))]);equal(races.map(r=>r.status).sort(),[201,409]);const stored=await db.prepare('SELECT object_key,content_hash FROM attachments WHERE id=?').bind(concurrent).first();assert(await bucket.get(stored.object_key));checks++;
 equal(externalRequests,0);const report={passed:checks,syntheticOnly:true,ephemeralD1:true,ephemeralR2:true,originalDtoExact:true,externalRequests,production:false};await writeFile('.sites-runtime/evidence/memory-media-integration.json',JSON.stringify(report,null,2));console.log(report);
}finally{await mf.dispose();}
