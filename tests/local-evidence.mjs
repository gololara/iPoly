// Project-local synthetic test artifacts; never read a sibling checkout.
import {mkdir} from 'node:fs/promises';
await mkdir(new URL('../.sites-runtime/evidence/hosted-sharing-authorized/',import.meta.url),{recursive:true});
