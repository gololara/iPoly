'use client';

import {MemoryNavigation} from './memory-navigation';
import {TeacherProfiles} from './teacher-profiles';
import type {Language} from '@/lib/model';

export function TeachersHome({language}:{language:Language}){
 return <div className="memory-detail-page">
  <MemoryNavigation section="teachers" language={language} onLanguage={value=>location.assign('/maestros?'+new URLSearchParams({language:value}))}/>
  <main className="memory-detail-main">
   <TeacherProfiles key={language} language={language}/>
  </main>
 </div>;
}
