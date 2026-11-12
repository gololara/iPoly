import {english} from './ui-en';

export const uiLocales = {es:{label:'Español',messages:{} as Record<string,string>},en:{label:'English',messages:english}} as const;
export type UiLocale = keyof typeof uiLocales;
export const uiLocaleCookie = 'ipoly-ui-language';
export function uiLocale(value: string | undefined): UiLocale {
 return value&&Object.hasOwn(uiLocales,value)?value as UiLocale:'es';
}
export function uiLocaleFromCookies(header:string|null):UiLocale{
 const cookie=header?.split(';').map(part=>part.trim()).find(part=>part.startsWith(uiLocaleCookie+'='));
 return uiLocale(cookie?.slice(uiLocaleCookie.length+1));
}
export function uiText(locale:UiLocale,message:string){
 const {messages}=uiLocales[locale];
 return Object.hasOwn(messages,message)?messages[message]:message;
}
