import {AUDIO_MAX_BYTES,AUDIO_MAX_SECONDS,inspectAudio} from './audio';
export type RecorderState='idle'|'requesting'|'recording'|'finishing';
type Options={getStream:()=>Promise<MediaStream>;createRecorder:(stream:MediaStream)=>MediaRecorder;onState:(s:RecorderState)=>void;onTick:(ms:number)=>void;onBlob:(blob:Blob,ms:number,reason:string,invalidReason?:string)=>void;onError:(message:string)=>void;now?:()=>number;maxMs?:number};
export class AudioRecording {
 state:RecorderState='idle';private generation=0;private stream?:MediaStream;private recorder?:MediaRecorder;private timer?:ReturnType<typeof setInterval>;private chunks:Blob[]=[];private bytes=0;private started=0;private reason='stopped';
 private options:Options;
 constructor(options:Options){this.options=options;}
 private change(s:RecorderState){this.state=s;this.options.onState(s);}
 private release(){if(this.timer)clearInterval(this.timer);this.timer=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;}
 async start(){if(this.state!=='idle')return;const run=++this.generation;this.change('requesting');try{
  const stream=await this.options.getStream();if(run!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;const r=this.options.createRecorder(stream);this.recorder=r;this.chunks=[];this.bytes=0;this.reason='stopped';
  r.ondataavailable=e=>{if(e.data.size){this.chunks.push(e.data);this.bytes+=e.data.size;if(this.bytes>AUDIO_MAX_BYTES)this.stop('size');}};
  r.onerror=()=>this.stop('interrupted');r.onstop=()=>{const chunks=this.chunks,reason=this.reason;this.release();this.recorder=undefined;void this.finish(chunks,r.mimeType,reason).finally(()=>this.change('idle'));};
  for(const track of stream.getTracks())track.addEventListener('ended',()=>this.stop('interrupted'),{once:true});
  this.started=(this.options.now??Date.now)();r.start(250);this.change('recording');this.options.onTick(0);this.timer=setInterval(()=>{const ms=(this.options.now??Date.now)()-this.started;this.options.onTick(Math.min(ms,AUDIO_MAX_SECONDS*1000));if(ms>=(this.options.maxMs??AUDIO_MAX_SECONDS*1000))this.stop('limit');},100);
 }catch(e){this.release();if(run===this.generation){this.change('idle');const name=(e as Error).name;this.options.onError(name==='NotAllowedError'?'No se concedió permiso al micrófono. Tu borrador sigue aquí.':name==='NotFoundError'?'No encontramos un micrófono. Puedes continuar con texto o fotos.':'No pudimos iniciar la grabación. Tu borrador sigue aquí.');}}}
 stop(reason='stopped'){
  this.reason=reason;if(this.state==='requesting'){this.generation++;this.release();this.change('idle');return;}
  if(this.state!=='recording')return;this.change('finishing');if(this.timer)clearInterval(this.timer);this.timer=undefined;
  if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();this.release();
 }
 private async finish(chunks:Blob[],mime:string,reason:string){const blob=new Blob(chunks,{type:mime});try{if(!blob.size)throw new Error('No se recuperó un fragmento de audio. Puedes volver a grabar.');const meta=inspectAudio(await blob.arrayBuffer());this.options.onBlob(blob,meta.durationMs,reason);}catch(e){const message=(e as Error).message;if(blob.size){let ms=0;try{ms=inspectAudio(await blob.arrayBuffer(),false).durationMs;}catch{}this.options.onBlob(blob,ms,reason,message);}this.options.onError(message);}}
}
export function recordingMime(){if(typeof MediaRecorder==='undefined')return null;return ['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m))??null;}
export const audioTime=(ms:number,roundUp=false)=>{const display=ms<=AUDIO_MAX_SECONDS*1000+120?Math.min(ms,AUDIO_MAX_SECONDS*1000):ms;const s=roundUp?Math.ceil(display/1000):Math.floor(display/1000);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
