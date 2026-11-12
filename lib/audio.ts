// Accept only the audio containers emitted by the supported browser recorders.
// Duration is read from the file, never trusted from an upload form.
export const AUDIO_MAX_BYTES=2*1024*1024;
export const AUDIO_MAX_SECONDS=60;
// AAC/Opus can include a final padded packet after the 60 s recording window.
export const AUDIO_PACKET_ALLOWANCE=.12;
const bad=()=>{throw new Error('No pudimos validar el audio. Usa una grabación MP4/AAC o WebM/Opus de iPoly.');};
const ascii=(b:Uint8Array,p:number,n:number)=>String.fromCharCode(...b.subarray(p,p+n));
export function inspectAudio(bytes:ArrayBuffer,enforceLimits=true){
 if(enforceLimits&&bytes.byteLength>AUDIO_MAX_BYTES)throw new Error('El audio supera 2 MB. Tu borrador se conserva; repite la grabación.');
 if(bytes.byteLength<16)bad();
 const b=new Uint8Array(bytes),v=new DataView(bytes);let seconds:number,mime:string;
 if(ascii(b,4,4)==='ftyp'){seconds=mp4(b,v);mime='audio/mp4';}
 else if(v.getUint32(0)===0x1a45dfa3){seconds=webm(b,v);mime='audio/webm';}
 else return bad();
 if(!Number.isFinite(seconds)||seconds<=0)bad();
 if(enforceLimits&&seconds>AUDIO_MAX_SECONDS+AUDIO_PACKET_ALLOWANCE)throw new Error('El audio supera 60 segundos. Tu borrador se conserva.');
 return {mime,durationMs:Math.round(seconds*1000)};
}
type Box={type:string;start:number;end:number};
function mp4(b:Uint8Array,v:DataView){
 function boxes(start:number,end:number):Box[]{const out:Box[]=[];let p=start;while(p<end){if(p+8>end)bad();let size=v.getUint32(p),h=8;if(size===1){if(p+16>end)bad();size=Number(v.getBigUint64(p+8));h=16;}if(size===0)size=end-p;if(!Number.isSafeInteger(size)||size<h||p+size>end)bad();out.push({type:ascii(b,p+4,4),start:p+h,end:p+size});p+=size;}return out;}
 const child=(box:Box,type:string)=>boxes(box.start,box.end).find(x=>x.type===type);
 const need=(box:Box|undefined)=>{if(!box)bad();return box!;};
 const top=boxes(0,b.length),moov=need(top.find(x=>x.type==='moov'));
 if(!top.some(x=>x.type==='mdat'&&x.end>x.start))bad();
 const tracks=boxes(moov.start,moov.end).filter(x=>x.type==='trak');if(tracks.length!==1)bad();
 const track=tracks[0],mdia=need(child(track,'mdia')),hdlr=need(child(mdia,'hdlr'));
 if(hdlr.start+12>hdlr.end||ascii(b,hdlr.start+8,4)!=='soun')bad();
 const mdhd=need(child(mdia,'mdhd')),version=b[mdhd.start],scaleOffset=mdhd.start+(version===1?20:12);if(scaleOffset+4>mdhd.end)bad();const scale=v.getUint32(scaleOffset);if(!scale)bad();
 const stbl=need(child(need(child(mdia,'minf')),'stbl')),stsd=need(child(stbl,'stsd'));
 if(stsd.start+8>stsd.end||v.getUint32(stsd.start+4)!==1)bad();const entries=boxes(stsd.start+8,stsd.end);if(entries[0]?.type!=='mp4a')bad();
 let duration=0,samples=0;
 const stts=child(stbl,'stts');if(stts){if(stts.start+8>stts.end)bad();const count=v.getUint32(stts.start+4);if(count>10000||stts.start+8+count*8>stts.end)bad();for(let i=0;i<count;i++){const p=stts.start+8+i*8;const n=v.getUint32(p);samples+=n;duration+=n*v.getUint32(p+4);}}
 const tkhd=need(child(track,'tkhd')),idOffset=tkhd.start+(b[tkhd.start]===1?20:12);if(idOffset+4>tkhd.end)bad();const trackId=v.getUint32(idOffset);
 let defaultDuration=0;const mvex=child(moov,'mvex');if(mvex)for(const trex of boxes(mvex.start,mvex.end).filter(x=>x.type==='trex')){if(trex.start+24>trex.end)bad();if(v.getUint32(trex.start+4)===trackId)defaultDuration=v.getUint32(trex.start+12);}
 let fragmented=0;
 for(const moof of top.filter(x=>x.type==='moof'))for(const traf of boxes(moof.start,moof.end).filter(x=>x.type==='traf')){
  const tfhd=need(child(traf,'tfhd'));if(tfhd.start+8>tfhd.end||v.getUint32(tfhd.start+4)!==trackId)bad();const flags=v.getUint32(tfhd.start)&0xffffff;let p=tfhd.start+8,def=defaultDuration;if(flags&1)p+=8;if(flags&2)p+=4;if(flags&8){if(p+4>tfhd.end)bad();def=v.getUint32(p);}
  const tfdt=child(traf,'tfdt');let time=0;if(tfdt){const h=b[tfdt.start]===1?8:4;if(tfdt.start+4+h>tfdt.end)bad();time=h===8?Number(v.getBigUint64(tfdt.start+4)):v.getUint32(tfdt.start+4);}
  for(const trun of boxes(traf.start,traf.end).filter(x=>x.type==='trun')){if(trun.start+8>trun.end)bad();const f=v.getUint32(trun.start)&0xffffff,n=v.getUint32(trun.start+4);if(n>100000)bad();let q=trun.start+8;if(f&1)q+=4;if(f&4)q+=4;for(let i=0;i<n;i++){let d=def;if(f&0x100){if(q+4>trun.end)bad();d=v.getUint32(q);q+=4;}if(!d)bad();if(f&0x200)q+=4;if(f&0x400)q+=4;if(f&0x800)q+=4;if(q>trun.end)bad();time+=d;samples++;}fragmented=Math.max(fragmented,time);}
 }
 if(!samples)bad();return Math.max(duration,fragmented)/scale;
}
type Element={id:number;start:number;end:number};
function webm(b:Uint8Array,v:DataView){
 function vint(p:number,id=false){if(p>=b.length||!b[p])return bad();let width=1,mask=128;while(!(b[p]&mask)){width++;mask>>=1;}if(width>8||p+width>b.length)bad();let value=id?b[p]:b[p]&(mask-1);for(let i=1;i<width;i++)value=value*256+b[p+i];return {value,width,unknown:!id&&value===2**(7*width)-1};}
 function elements(start:number,end:number){const out:Element[]=[];let p=start;while(p<end){const id=vint(p,true),size=vint(p+id.width);const s=p+id.width+size.width;let e=size.unknown?end:s+size.value;if(size.unknown&&id.value===0x1f43b675){let q=s;while(q<end){const next=vint(q,true);if([0x1f43b675,0x1c53bb6b,0x1549a966,0x1654ae6b].includes(next.value)){e=q;break;}const len=vint(q+next.width);if(len.unknown)bad();q+=next.width+len.width+len.value;if(q>end)bad();}}else if(size.unknown&&id.value!==0x18538067)bad();if(e>end||e<s)bad();out.push({id:id.value,start:s,end:e});p=e;}return out;}
 const uint=(e:Element)=>{if(e.end-e.start>8)bad();let n=0;for(let p=e.start;p<e.end;p++)n=n*256+b[p];return n;};
 const root=elements(0,b.length),segment=root.find(e=>e.id===0x18538067);if(!segment)return bad();const children=elements(segment.start,segment.end),info=children.find(e=>e.id===0x1549a966),tracks=children.find(e=>e.id===0x1654ae6b);if(!tracks||!info)return bad();
 const fields=elements(info.start,info.end),scale=fields.find(e=>e.id===0x2ad7b1);const ns=scale?uint(scale):1000000;if(ns<=0||ns>1e9)bad();
 const entries=elements(tracks.start,tracks.end).filter(e=>e.id===0xae);if(entries.length!==1)bad();const track=elements(entries[0].start,entries[0].end),kind=track.find(e=>e.id===0x83),codec=track.find(e=>e.id===0x86),number=track.find(e=>e.id===0xd7);if(!kind||uint(kind)!==2||!codec||ascii(b,codec.start,codec.end-codec.start)!=='A_OPUS'||!number)bad();
 const trackNumber=uint(number!);let max=0,packets=0;
 for(const cluster of children.filter(e=>e.id===0x1f43b675)){const fields=elements(cluster.start,cluster.end),stamp=fields.find(e=>e.id===0xe7);if(!stamp)bad();const base=uint(stamp!);for(const block of fields.filter(e=>e.id===0xa3||e.id===0xa0)){const e=block.id===0xa0?elements(block.start,block.end).find(e=>e.id===0xa1):block;if(!e)bad();const num=vint(e!.start);let p=e!.start+num.width;if(num.value!==trackNumber||p+4>e!.end)bad();const offset=v.getInt16(p);const flags=b[p+2];p+=3;if(flags&6)bad();const toc=b[p],config=toc>>3,code=toc&3;const ms=config>=16?[2.5,5,10,20][config&3]:config>=12?[10,20][config&1]:[10,20,40,60][config&3];const count=code===0?1:code===3?(b[p+1]&63):2;if(!count||ms*count>120||p+(code===3?2:1)>=e!.end)bad();max=Math.max(max,(base+offset)*ns/1e9+ms*count/1000);packets++;}}
 if(!packets)bad();return max;
}
