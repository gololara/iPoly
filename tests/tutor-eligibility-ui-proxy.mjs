// Local-only synthetic identity. Never imported by the app or production build.
import http from 'node:http';
http.createServer(async(req,res)=>{try{
 const headers={...req.headers,host:'127.0.0.1:8788','oai-authenticated-user-id':'qa-tutor-history-ui','oai-authenticated-user-email':'qa-tutor-history-ui@example.test'};
 if(headers.origin)headers.origin='http://127.0.0.1:8788';
 let body;if(!['GET','HEAD'].includes(req.method)){const parts=[];for await(const p of req)parts.push(p);body=Buffer.concat(parts);}
 const r=await fetch('http://127.0.0.1:8788'+req.url,{method:req.method,headers,body,redirect:'manual'});res.statusCode=r.status;
 r.headers.forEach((v,k)=>{if(!['content-length','content-encoding','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(Buffer.from(await r.arrayBuffer()));
}catch(e){res.statusCode=502;res.end(String(e));}}).listen(8793,'127.0.0.1',()=>console.log('Synthetic tutor QA http://127.0.0.1:8793'));
