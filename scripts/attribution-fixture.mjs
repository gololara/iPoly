import assert from 'node:assert/strict';
// Only called by the retained, outbound-blocked ephemeral preview. No live Site
// URL, account, cookie or credential is accepted here.
export async function seedAttributionPreview(mf,owner){
 const db=await mf.getD1Database('DB');assert.equal((await db.prepare('SELECT count(*) total FROM memory_attribution_corrections').first()).total,0);
 const before='74000000-0000-4000-8000-000000000001',after='74000000-0000-4000-8000-000000000002',at='2026-01-02T10:00:00.000Z';
 for(const [id,debrief]of [[before,'74000000-0000-4000-8000-000000000011'],[after,'74000000-0000-4000-8000-000000000012']]){
  const text='En esta explicación de ejemplo se distingue lo que escuché de la forma que quería usar. El original y la foto siguen intactos.',change={noteId:id,expectedVersion:1,clarified:text,title:'Autoría de una aclaración · ejemplo',tags:[]};
  await db.prepare('INSERT INTO notes(id,owner,language,original,clarified,title,created_at,updated_at,version,request_hash) VALUES(?,?,?,?,?,?,?,?,2,?)').bind(id,owner,'sq','Una frase que apunté tal como la escuché.',text,change.title,at,at,id).run();
  await db.prepare("INSERT INTO debriefs(id,owner,summary,changes,state,created_at,applied_at) VALUES(?,?,?,?,'applied',?,?)").bind(debrief,owner,'Solo datos sintéticos para revisión',JSON.stringify([change]),at,at).run();
  await db.prepare("INSERT INTO attachments(id,owner,note_id,object_key,included,mime,size,origin,created_at) SELECT ?,owner,?,object_key,included,mime,size,origin,created_at FROM attachments WHERE id='70000000-0000-4000-8000-000000000021' AND owner=?").bind(id==before?'74000000-0000-4000-8000-000000000031':'74000000-0000-4000-8000-000000000032',id,owner).run();
  await db.prepare('INSERT INTO revisions(id,owner,note_id,version,content,created_at) VALUES(?,?,?,2,?,?)').bind(debrief+':'+id,owner,id,JSON.stringify({after:change}),at).run();
  if(id===after){
   const rpc=async(name,args)=>{const response=await mf.dispatchFetch('http://localhost/mcp',{method:'POST',headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'synthetic@example.test','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),body=await response.json();assert.equal(body.result?.isError,undefined);return JSON.parse(body.result.content[0].text);};
   const p=await rpc('ipoly_proponer_atribucion',{id:'74000000-0000-4000-8000-000000000020',noteId:id,debriefId:debrief,expectedNoteVersion:2,previousCorrectionId:null,author:{role:'ai',id:null,name:'ChatGPT'},evidence:{kind:'user_attestation',statement:'En este ejemplo, el usuario confirma que ChatGPT redactó esta explicación. La confirmación se registra ahora; no cambia la fecha histórica.',reference:'Demostración sintética'}});
   assert.equal((await rpc('ipoly_aplicar_atribucion',{id:p.id,proposalVersion:p.proposalVersion,contentHash:p.contentHash,confirmed:true,approvedContent:p.content})).state,'applied');
  }
 }
 return {before,after};
}
