'use client';

import {MemoryNavigation} from './memory-navigation';
import {TeacherProfiles} from './teacher-profiles';
import {LegacyTeacherAccess} from './legacy-teacher-access';
import {Button} from './ui/button';
import {useUiText} from './ui-locale';
import type {Language} from '@/lib/model';

export function TeachersHome({language}:{language:Language}){
 const {t}=useUiText();
 const query=new URLSearchParams({language});
 return <div className="memory-detail-page simple-classes-page">
  <MemoryNavigation section="classes" language={language} onLanguage={value=>location.assign('/maestros?'+new URLSearchParams({language:value}))}/>
  <main className="memory-detail-main simple-classes-main">
   <TeacherProfiles key={language} headingLevel={1} language={language}/>
   <LegacyTeacherAccess/>
   <section className="memory-historical">
    <h2>{t('Clases e historial')}</h2>
    <p className="memory-small">{t('Si quieres organizar una sesión o consultar las anteriores, puedes hacerlo aquí.')}</p>
    <Button asChild variant="secondary"><a href={'/clases?'+query}>{t('Ver clases e historial')}</a></Button>
   </section>
  </main>
 </div>;
}
