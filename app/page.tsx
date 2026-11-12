import {redirect} from 'next/navigation';
import {legacyDestination} from '@/lib/legacy-navigation';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 redirect(legacyDestination(await searchParams));
}
