'use client';
import {useUiText} from './ui-locale';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {SlidersHorizontal} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Checkbox} from './ui/checkbox';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import {MemoryLanguage,MemoryPrimaryNavigation} from './memory-navigation';
import {memoryHistoryFilters,memoryHistoryLabels,type MemoryListFilters} from '@/lib/memory-list-model';

export function MemoryListHeader({filters,onFilters,open,onOpenChange}:{filters:MemoryListFilters;onFilters:(filters:MemoryListFilters)=>void;open:boolean;onOpenChange:(open:boolean)=>void}){
 const {t:tr}=useUiText();
 const [progress,setProgress]=useState(0);
 const header=useRef<HTMLElement>(null),brand=useRef<HTMLAnchorElement>(null),schedule=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   frame=0;
   const node=header.current;if(!node)return;
   const active=document.activeElement;
   // A control must stay visible while the keyboard user is interacting with it.
   const keepExpanded=active instanceof Element&&node.contains(active)&&!!active.closest('[data-memory-expanded]');
   const range=parseFloat(getComputedStyle(node).getPropertyValue('--memory-collapse-distance'))||228;
   setProgress(keepExpanded?0:Math.min(1,Math.max(0,window.scrollY/range)));
  };
  const request=()=>{if(!frame)frame=requestAnimationFrame(update);};
  schedule.current=request;window.addEventListener('scroll',request,{passive:true});window.addEventListener('resize',request);update();
  return()=>{window.removeEventListener('scroll',request);window.removeEventListener('resize',request);cancelAnimationFrame(frame);schedule.current=()=>{};};
 },[]);
 const hidden=progress>=.55,compact=progress===1;
 const toggle=(history:typeof memoryHistoryFilters[number])=>onFilters({...filters,history:filters.history.includes(history)?filters.history.filter(h=>h!==history):[...filters.history,history]});
 const chosen=filters.history.map(h=>tr(memoryHistoryLabels[h])).join(' · ')||tr("Todas las memorias");
 const toTop=()=>{window.scrollTo({top:0,behavior:'instant'});setProgress(0);brand.current?.focus({preventScroll:true});};
 return <><div className="memory-header-space" aria-hidden="true"/>
 <header ref={header} className="memory-browse-header" data-compact={compact} data-extras-hidden={hidden} style={{'--memory-collapse':progress} as CSSProperties} onFocusCapture={e=>{if((e.target as Element).closest('[data-memory-expanded]'))setProgress(0);}} onBlurCapture={()=>schedule.current()}>
 <div className="memory-browse-header-inner">
 <a ref={brand} className="memory-browse-brand" href="#memory-list-title" aria-label={tr("iPoly · Volver al inicio de Memorias")} onClick={e=>{e.preventDefault();toTop();}}><img src="/logo.png" width="100" height="50" alt="iPoly"/></a>
 <div className="memory-browse-language memory-browse-expanded" data-memory-expanded="" aria-hidden={hidden} inert={hidden||undefined}><MemoryLanguage language={filters.language} onLanguage={language=>onFilters({...filters,language})}/></div>
 <div className="memory-browse-navigation memory-browse-expanded" data-memory-expanded="" aria-hidden={hidden} inert={hidden||undefined}><MemoryPrimaryNavigation language={filters.language}/></div>
 <h1 className="memory-browse-title memory-browse-expanded" id="memory-list-title" tabIndex={-1} data-memory-expanded="" aria-hidden={hidden} inert={hidden||undefined}>{tr("Memorias")}</h1>
 <div className="memory-browse-search-row">
 <form role="search" onSubmit={e=>e.preventDefault()}><label className="sr-only" htmlFor="memory-search">{tr("Buscar una frase, un contexto o un aporte")}</label><Input id="memory-search" type="search" autoComplete="off" enterKeyHint="search" placeholder={tr("Buscar una frase, un contexto, un aporte…")} maxLength={300} value={filters.q} onChange={e=>onFilters({...filters,q:e.target.value})}/></form>
 <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild><Button type="button" variant="secondary" className="memory-history-trigger" aria-label={tr("Historial ·")+' '+(filters.history.length?filters.history.length+' '+tr("filtros elegidos"):tr("Todas las memorias"))} title={tr('Historial')+': '+chosen}><SlidersHorizontal aria-hidden="true"/><span className="memory-history-word">{tr("Historial")}</span>{filters.history.length>0&&<span className="memory-history-count">{filters.history.length}</span>}</Button></PopoverTrigger>
 <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="memory-history-panel" aria-labelledby="memory-history-title"><h2 id="memory-history-title">{tr("Historial de la memoria")}</h2><fieldset><legend>{tr("Mostrar si coincide con cualquiera de los filtros elegidos")}</legend>{memoryHistoryFilters.map(h=><label key={h} htmlFor={'history-'+h}><Checkbox id={'history-'+h} checked={filters.history.includes(h)} onCheckedChange={()=>toggle(h)}/><span>{tr(memoryHistoryLabels[h])}</span></label>)}</fieldset><div className="memory-history-actions"><Button type="button" variant="ghost" onClick={()=>onFilters({...filters,history:[]})}>{tr("Todas las memorias")}</Button><Button type="button" onClick={()=>onOpenChange(false)}>{tr("Listo")}</Button></div></PopoverContent></Popover>
 </div>
 <p className="memory-browse-selection memory-browse-expanded" data-memory-expanded="" aria-hidden={hidden} inert={hidden||undefined} title={chosen}> {chosen}</p>
 </div></header></>;
}
