export type WorkspaceView='today'|'debrief'|'memory'|'tutor';
export type TutorLanguage='all'|'sq'|'en';
export type WorkspaceRoute={view:WorkspaceView;preparationId:string|null;tutorLanguage:TutorLanguage};
export const workspaceMenu=[{view:'today',label:'Hoy'},{view:'debrief',label:'Debriefing'},{view:'memory',label:'Memoria'},{view:'tutor',label:'Clases con maestro'}] as const;
export function readWorkspaceRoute(search:string):WorkspaceRoute{
 const p=new URLSearchParams(search),raw=p.get('view'),view=workspaceMenu.some(m=>m.view===raw)?raw as WorkspaceView:'today';
 const preparation=p.get('preparation'),language=p.get('language');
 return {view,preparationId:view==='tutor'&&preparation&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(preparation)?preparation:null,tutorLanguage:view==='tutor'&&(language==='sq'||language==='en')?language:'all'};
}
export function workspaceHref(route:WorkspaceRoute){
 const p=new URLSearchParams({view:route.view});
 if(route.view==='tutor'){if(route.tutorLanguage!=='all')p.set('language',route.tutorLanguage);if(route.preparationId)p.set('preparation',route.preparationId);}
 return '/?'+p.toString();
}
