import {z} from 'zod';
import {database, digest} from './data';
import {languageCatalogSql} from './language-catalog-sql';
import type {LearningLanguage} from './language';

const nameSchema = z.string().max(160).transform(name => name.normalize('NFKC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(60).regex(/^[\p{L}\p{M}\p{N} .’'()\-·]+$/u).refine(name => /\p{L}/u.test(name)));
const inputSchema = z.object({name: nameSchema}).strict();
const aliases = new Map([
  ['shqip', 'sq'], ['albanian', 'sq'], ['albanés', 'sq'], ['albanes', 'sq'],
  ['english', 'en'], ['inglés', 'en'], ['ingles', 'en'],
]);
export async function listLearningLanguages(owner: string): Promise<LearningLanguage[]> {
  return (await database().prepare(languageCatalogSql+' ORDER BY created_at,id')
    .bind(owner).all<LearningLanguage>()).results.map(({id,name})=>({id,name}));
}
export async function addLearningLanguage(owner: string, input: unknown): Promise<LearningLanguage> {
  const {name} = inputSchema.parse(input);
  const normalized = name.toLowerCase();
  const legacy = aliases.get(normalized);
  const id = legacy ?? 'lang-' + (await digest(normalized)).slice(0,24);
  const existing = (await listLearningLanguages(owner)).find(language => language.id === id);
  if (existing) return existing;
  const db = database();
  // The composite key makes concurrent requests for the same name idempotent.
  await db.prepare('INSERT INTO learning_languages(owner,id,name,created_at) VALUES(?,?,?,?) ON CONFLICT(owner,id) DO NOTHING')
    .bind(owner,id,name,new Date().toISOString()).run();
  return (await db.prepare('SELECT id,name FROM learning_languages WHERE owner=? AND id=?')
    .bind(owner,id).first<LearningLanguage>())!;
}
