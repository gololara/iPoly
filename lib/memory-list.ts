import {languageId} from './language';
import {z} from 'zod';
import {ApiError,database} from './data';
import {memoryLedgerSql} from './memory-approval-sql';
import {foldMemoryTextSql,memoryListSourceCTEs} from './memory-source-sql';
import {memoryHistoryFilters,type MemoryListItem,type MemoryListPage} from './memory-list-model';
const schema=z.object({language:languageId,q:z.string().max(300).default(''),history:z.array(z.enum(memoryHistoryFilters)).max(memoryHistoryFilters.length).default([]),offset:z.number().int().min(0).max(100000).default(0)}).strict();
// Two SELECTs in one snapshot: ledger integrity and the bounded page. No
// per-memory requests, writes or silently partial results after a bad restore.
export async function listMemories(owner:string,input:unknown):Promise<MemoryListPage>{
 const f=schema.parse(input),q=f.q.trim(),history=[...new Set(f.history)],where=['s.matched=1'];
 const conditions:Record<string,string>={no_debrief:'s.debrief=0',debrief:'s.debrief=1',class:'s.class_work=1',user:'s.user=1',ai:'s.ai=1',tutor:'s.tutor=1'};
 if(history.length)where.push('('+history.map(h=>conditions[h]).join(' OR ')+')');
 const search=q?`instr(${foldMemoryTextSql('text')},${foldMemoryTextSql('?')})>0`:'1';
 const sql=`WITH base AS (SELECT n.id,n.owner,n.language,n.original,n.clarified,n.title,n.created_at FROM notes n WHERE n.owner=? AND n.language=?),${memoryListSourceCTEs},summary AS (
  SELECT note_id,MAX(debrief) debrief,MAX(class_work) class_work,MAX(CASE WHEN role='user' THEN 1 ELSE 0 END) user,MAX(CASE WHEN role='ai' THEN 1 ELSE 0 END) ai,MAX(CASE WHEN role='tutor' THEN 1 ELSE 0 END) tutor,
  MAX(CASE WHEN debrief=1 THEN julianday(happened_at) END) debrief_date,MAX(CASE WHEN class_work=1 THEN julianday(happened_at) END) class_date,
  MAX(CASE WHEN ${search} THEN 1 ELSE 0 END) matched${q?`,MAX(CASE WHEN ${search} THEN substr(text,1,400) END) match_text`:`,NULL match_text`}
  FROM sources GROUP BY note_id)
 SELECT n.id,n.language,n.title,substr(n.original,1,600) original,substr(n.clarified,1,600) clarified,n.created_at,
  s.debrief,s.class_work,s.user,s.ai,s.tutor,strftime('%Y-%m-%dT%H:%M:%fZ',s.debrief_date) debrief_at,strftime('%Y-%m-%dT%H:%M:%fZ',s.class_date) class_at,s.match_text,
  EXISTS(SELECT 1 FROM attachments a WHERE a.note_id=n.id AND a.owner=n.owner AND a.included=1 AND a.mime LIKE 'audio/%') audio
 FROM base n JOIN summary s ON s.note_id=n.id WHERE ${where.join(' AND ')} ORDER BY n.created_at DESC,n.id DESC LIMIT 21 OFFSET ?`;
 const args:unknown[]=[owner,f.language,...(q?[q,q]:[]),f.offset];
 const db=database(),results=await db.batch([
  db.prepare(`SELECT n.id FROM notes n WHERE n.owner=? AND n.language=? AND NOT (${memoryLedgerSql('n.owner','n.id')}) LIMIT 1`).bind(owner,f.language),
  db.prepare(sql).bind(...args)
 ]);
 if(results[0].results.length)throw new ApiError(409,'Memory history could not be reconstructed safely.');
 const rows=results[1].results as {id:string;language:string;title:string;original:string;clarified:string;created_at:string;debrief:number;class_work:number;user:number;ai:number;tutor:number;debrief_at:string|null;class_at:string|null;match_text:string|null;audio:number}[];
 const memories:MemoryListItem[]=rows.slice(0,20).map(n=>({id:n.id,language:n.language,title:n.title||n.original.split('\n')[0]?.slice(0,120)||(n.audio?'Un recuerdo en audio':'Una memoria sin texto'),excerpt:n.title?(n.clarified||n.original):'',createdAt:n.created_at,history:{debrief:n.debrief===1,class:n.class_work===1,user:n.user===1,ai:n.ai===1,tutor:n.tutor===1},debriefAt:n.debrief_at,classAt:n.class_at,matchedExcerpt:q?n.match_text:null}));
 return {memories,nextOffset:rows.length>20?f.offset+20:null};
}
