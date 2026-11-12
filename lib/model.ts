import type {Language} from './language';
export type {Language} from './language';
export type Tag={id:string;name:string;normalized:string};
export type Attachment={id:string;mime:string;size:number;origin:string;url:string;duration_ms:number|null};
export type Note={id:string;language:Language;original:string;clarified:string;title:string;created_at:string;updated_at:string;version:number;reviewed:number;tags:Tag[];attachments:Attachment[]};
export type Change={noteId:string;expectedVersion:number;clarified:string;title?:string;tags:string[]};
