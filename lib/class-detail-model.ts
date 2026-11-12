export const classTypes={debrief:'Preparación desde debriefing',gpa:'GPA',other:'Otra metodología'} as const;
export type ClassType=keyof typeof classTypes;
export type ClassDetails={classId:string;version:number;threadVersion:number|null;editable:boolean;classDate:string|null;classType:ClassType|null;methodology:string};
export function validClassDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'0001-01-01'||s>'9999-12-31')return false;const d=new Date(s+'T00:00:00.000Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s;}
export function displayClassDate(s:string){const [y,m,d]=s.split('-');return `${d}/${m}/${y}`;}
