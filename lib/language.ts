import {z} from 'zod';

export type Language = string;
export type LearningLanguage = {id: Language; name: string};

export const languageIdPattern = '^(?:sq|en|lang-[a-f0-9]{24})$';
const idPattern = new RegExp(languageIdPattern);
export function isLanguageId(value: unknown): value is Language {
  return typeof value === 'string' && idPattern.test(value);
}
export const languageId = z.string().regex(idPattern);

export const legacyLanguageNames: Record<string, string> = {sq: 'Shqip', en: 'English'};
export function learningLanguageName(id: Language, languages: LearningLanguage[] = []) {
  return languages.find(language => language.id === id)?.name ?? legacyLanguageNames[id] ?? 'Idioma';
}
