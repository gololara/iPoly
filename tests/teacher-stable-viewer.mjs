import assert from 'node:assert/strict';
import vm from 'node:vm';
/** Runs the served portal JS and real local API; not a browser geometry substitute. */
export async function verifyStablePortal({origin,linkId,teacherName,emptyLinkId,disable}){
 const checks=[],ok=(value,name)=>{assert.ok(value,name);checks.push(name)};
 const html=await(await fetch(origin+'/?teacher='+linkId)).text(),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 ok(!html.includes('type="password"')&&!script.includes('/unlock/'),'teacher portal has no code form or unlock request');
 const element=()=>({textContent:'',children:[],className:'',appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}});
 const root=element(),identity=element(),selector=element(),label=element(),help=element(),elements={portal:root,identity,'portal-language':selector,'portal-language-label':label,'portal-language-help':help},storage=new Map([['ipoly.teacher.interface-language','es']]),events={},location={href:origin+'/?teacher='+linkId};let pending=0,offline=false,hold=false,release=null,force=null;
 const text=node=>node.textContent+' '+node.children.map(text).join(' ');
 const nodes=node=>[node,...node.children.flatMap(nodes)];
 const click=label=>{const n=nodes(root).find(x=>x.textContent===label&&typeof x.onclick==='function');assert.ok(n,'missing '+label);n.onclick()};
 const context={URL,location,navigator:{languages:['es-ES']},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},history:{pushState(_a,_b,url){location.href=String(url)}},document:{documentElement:{lang:'es'},getElementById:id=>elements[id],createElement:element,visibilityState:'visible',addEventListener:(event,fn)=>events[event]=fn},addEventListener:(event,fn)=>events[event]=fn,setInterval:fn=>events.interval=fn,fetch:async(path,options)=>{pending++;try{if(offline)throw Error('Synthetic network failure');const response=force?Response.json(force):await fetch(origin+path,options);force=null;const result=new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});if(hold){hold=false;return await new Promise(resolve=>release=()=>resolve(result))}return result;}finally{pending--}}};
 async function until(predicate){for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,5));if(predicate())return;}throw Error('Portal did not reach expected state')}
 const settle=()=>until(()=>pending===0);
 vm.runInNewContext(script,context);await settle();ok(text(root).includes('Hola, '+teacherName)&&text(root).includes('PRÓXIMA CLASE'),'stable link renders named cover and next shared class');ok(text(root).includes('1 material para esta clase')&&!text(root).includes('1 materiales para esta clase'),'one chosen material uses singular');
 click('Ver material de la clase');await settle();ok(text(root).includes('Material para la clase')&&new URL(location.href).searchParams.get('view')==='material','material navigation works without a separate code or service');
 const snapshot=await(await fetch(origin+'/api/links/'+linkId)).json();
 offline=true;events.focus();await settle();ok(text(root).includes('No pudimos comprobar')&&!text(root).includes(snapshot.copy.items[0].text),'network error clears unverifiable material');offline=false;click('Volver a intentar');await settle();ok(text(root).includes(snapshot.copy.items[0].text),'recheck recovers material without login');
 hold=true;events.focus();await until(()=>typeof release==='function');
 await disable();events.focus();await until(()=>text(root).includes('Este enlace ya no está disponible'));
 ok(!text(root).includes(snapshot.copy.items[0].text)&&identity.textContent==='Material de clase','disable clears cover identity and material on open page');
 release();await settle();ok(text(root).includes('Este enlace ya no está disponible')&&!text(root).includes(snapshot.copy.items[0].text),'late successful response cannot restore disabled material');
 force=snapshot;events.interval();await settle();ok(text(root).includes('Este enlace ya no está disponible'),'disabled page never revives from a later stale cached success');
 events.pagehide();ok(root.children.length===0&&identity.textContent==='Material de clase','pagehide removes material before back-forward caching');events.pageshow();await settle();ok(text(root).includes('Este enlace ya no está disponible'),'pageshow rechecks rather than restoring cached material');
 if(emptyLinkId){vm.runInNewContext(script,{...context,location:{href:origin+'/?teacher='+emptyLinkId}});await settle();ok(text(root).includes('Sin material vigente')&&!text(root).includes(snapshot.copy.items[0].text),'expired copy retains an empty cover without expired material');}
 return {checks,method:'served JavaScript + lightweight DOM + real local HTTP; fresh native browser QA pending'};
}
