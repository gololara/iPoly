'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {Globe} from 'lucide-react';
import {uiLocaleCookie,uiLocale,uiLocales,uiText,type UiLocale} from '@/lib/ui-locale';
import {Button} from './ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuTrigger} from './ui/dropdown-menu';

const Locale=createContext<UiLocale>('es');
const spanish=(s:string)=>s;
const translators=Object.fromEntries(Object.keys(uiLocales).map(key=>[key,(message:string)=>uiText(uiLocale(key),message)])) as Record<UiLocale,(message:string)=>string>;
export function useUiText(){
 const locale=useContext(Locale);
 return {locale,t:translators[locale]??spanish};
}
export function UiLocaleProvider({locale,children}:{locale:UiLocale;children:ReactNode}){
 return <Locale.Provider value={locale}>{children}</Locale.Provider>;
}
export function UiLocaleSelector(){
 const {locale,t}=useUiText();
 const label=t('Idioma de la interfaz');
 function changeLocale(value:string){
  if(value===locale||!Object.hasOwn(uiLocales,value))return;
  document.cookie=uiLocaleCookie+'='+value+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
  location.reload();
 }
 return <DropdownMenu modal={false}>
  <DropdownMenuTrigger asChild>
   <Button type="button" variant="ghost" size="icon-sm" className="ipoly-ui-locale-button" aria-label={label} title={label}>
    <Globe aria-hidden="true" className="size-[18px]"/>
   </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" sideOffset={6} aria-label={label} className="bg-white text-foreground">
   <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
    {Object.entries(uiLocales).map(([id,option])=><DropdownMenuRadioItem key={id} value={id} lang={id} className="min-h-11 cursor-pointer">{option.label}</DropdownMenuRadioItem>)}
   </DropdownMenuRadioGroup>
  </DropdownMenuContent>
 </DropdownMenu>;
}
