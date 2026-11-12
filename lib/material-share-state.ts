export type SharedCopy={id:string;delivery_status:string;published_at:number;expires_at:number;revoked_at:number|null;url:string|null;expired?:boolean};
export function sharedCopyState(copy:SharedCopy,uncertain=false,now=Date.now()){
 const expired=copy.delivery_status==='published'&&(copy.expired===true||copy.expires_at<=now),live=!uncertain&&copy.delivery_status==='published'&&!expired&&!!copy.url;
 return {live,expired,label:uncertain?'Estado actual sin confirmar':copy.delivery_status==='revoked'?'Retirada confirmada':copy.delivery_status==='revocation_pending'?'Retirada pendiente':copy.delivery_status==='pending'?'Publicación pendiente':expired?'Caducada':copy.delivery_status==='published'?'Publicada confirmada':'Estado actual sin confirmar',url:live?copy.url:null};
}

export function publicationFeedback(status:string){return {issueCode:status==='published'||status==='pending',message:status==='published'?'Copia publicada y confirmada.':status==='pending'?'Publicación pendiente. El enlace aparecerá únicamente tras la confirmación remota.':status==='revoked'?'Esta copia ya fue retirada. El intento no la volvió a publicar.':status==='revocation_pending'?'Retirada pendiente: el enlace todavía no está confirmado como retirado.':'No recibimos un estado confirmado. Vuelve a comprobar los enlaces antes de continuar.'};}
