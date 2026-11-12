import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>({type:'ESModule',path:resolve('dist/server',f)}))];
const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
let online=false;
const outbound=[];
const mf=new Miniflare({
 modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',
 compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
 d1Databases:['DB'],r2Buckets:['BUCKET'],
 bindings:{TEACHER_COPY_ORIGIN:'https://teacher-fixture.example',TEACHER_COPY_SIGNING_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',key.privateKey))},
 outboundService:async request=>{
  const body=await request.text(),command=JSON.parse(body),path=new URL(request.url).pathname;
  const signature=Buffer.from(request.headers.get('x-command-signature')??'','base64');
  assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key.publicKey,signature,new TextEncoder().encode(body)));
  assert.ok(command.action==='disable'&&path==='/api/links/commands'||command.action==='revoke'&&path==='/api/commands','no publish command');
  outbound.push(command.action);
  if(!online)return new Response(null,{status:503});
  return Response.json(command.action==='disable'?{state:'disabled',linkId:command.linkId}:{state:'revoked'});
 }
});
const A='fixture-owner',B='foreign-owner',L='a'.repeat(64),P='b'.repeat(64),copy='c'.repeat(64),now=Date.now();
async function api(path,body,who=A,extra={}){
 const res=await mf.dispatchFetch('http://localhost/api/'+path,{method:body?'POST':'GET',headers:{...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'}:{}),'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});
 return {status:res.status,data:await res.json()};
}
try{
 const db=await mf.getD1Database('DB');
 for(const f of(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+f,'utf8')).split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const teacher=crypto.randomUUID(),classId=crypto.randomUUID(),date=new Date(now).toISOString();
 await db.prepare('INSERT INTO teachers(id,owner,name,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(teacher,A,'Maestra sintética',teacher,date,date).run();
 await db.prepare("INSERT INTO teacher_links(id,owner,teacher_id,status,version,remote_version,current_publication_id,created_at) VALUES(?,?,?,'active',1,1,?,?)").bind(L,A,teacher,copy,now-1000).run();
 await db.prepare("INSERT INTO teacher_share_copies(id,owner,link_id,class_id,teacher_id,link_version,snapshot,request_hash,status,published_at,expires_at) VALUES(?,?,?,?,?,1,'{}',?,'published',?,?)").bind(copy,A,L,classId,teacher,copy,now-2000,now-1000).run();
 await db.prepare("INSERT INTO teacher_share_outbox(id,owner,link_id,version,action,payload) VALUES('archived-publish',?,?,1,'publish','{}')").bind(A,L).run();
 await db.prepare("INSERT INTO teacher_publications(id,owner,class_id,teacher_id,snapshot,code_hash,request_hash,published_at,expires_at,delivery_status) VALUES(?,?,?,?,'{}','hash',?,?,?,'published')").bind(P,A,classId,teacher,P,now-2000,now+10000).run();
 const list=await api('legacy-teacher-access');
 assert.equal(list.status,200);
 assert.deepEqual(list.data.access.map(x=>({id:x.id,kind:x.kind,status:x.status})),[{id:L,kind:'link',status:'active'},{id:P,kind:'copy',status:'published'}]);
 assert.ok(list.data.access.every(x=>!('url'in x)&&!('snapshot'in x)));
 assert.deepEqual((await api('legacy-teacher-access',undefined,B)).data.access,[]);
 assert.equal((await api('legacy-teacher-access',undefined,null)).status,401);
 assert.equal((await api('teacher-sharing-disable',{linkId:L,confirmed:true},B)).status,404);
 assert.equal((await api('material-revoke',{id:P,confirmed:true},B)).status,404);
 assert.equal((await api('teacher-sharing-disable',{linkId:L,confirmed:true},A,{origin:'https://other.example'})).status,403);
 for(const path of ['teacher-sharing-retry','teacher-sharing-confirm','material-retry','material-publish'])assert.equal((await api(path,{})).status,410);
 assert.deepEqual(outbound,[]);
 assert.equal((await api('teacher-sharing-disable',{linkId:L,confirmed:true})).data.link.status,'disable_pending');
 assert.equal((await api('material-revoke',{id:P,confirmed:true})).data.status,'revocation_pending');
 online=true;
 assert.equal((await api('teacher-sharing-disable',{linkId:L,confirmed:true})).data.link.status,'disabled');
 assert.equal((await api('material-revoke',{id:P,confirmed:true})).data.status,'revoked');
 assert.deepEqual(outbound,['disable','revoke','disable','revoke']);
 assert.deepEqual((await api('legacy-teacher-access')).data.access,[]);
 assert.equal((await db.prepare("SELECT state FROM teacher_share_outbox WHERE id='archived-publish'").first()).state,'pending','old publish is never processed');
 assert.equal((await db.prepare('SELECT snapshot FROM teacher_share_copies WHERE id=?').bind(copy).first()).snapshot,'{}','old copy contents are preserved');
 console.log('Legacy access: both formats are owner-only, retain history and support revocation/retry without publishing.');
}finally{await mf.dispose();}
