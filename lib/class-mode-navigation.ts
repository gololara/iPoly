'use client';
let pending=false;
export function setClassDraftPending(value:boolean){pending=value;}
export function confirmClassNavigation(){return !pending||window.confirm('Hay cambios de modo clase sin guardar. ¿Quieres salir y descartarlos?');}
