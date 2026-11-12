export type Teacher={id:string;name:string;languageId:string;languages:string[];version:number;createdAt:string;updatedAt:string};
export function teacherInitials(name:string){const words=name.trim().split(/\s+/).filter(Boolean);return [...new Set([0,words.length-1])].map(i=>words[i]?.match(/[\p{L}\p{N}]/u)?.[0]||'').join('').toLocaleUpperCase('es')||'•';}
