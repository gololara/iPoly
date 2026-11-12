import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {validateAttributionBackup} from '../lib/attribution-backup.ts';
// Run with --experimental-strip-types --import ./tests/register-typescript.mjs.
// This is a local validator, not an exporter or a live database connection.
const path=process.argv[2];if(process.argv.length!==3||!path||!isAbsolute(path))throw Error('Pass one absolute path to the private complete journal envelope');
const report=await validateAttributionBackup(JSON.parse(await readFile(path,'utf8')));
console.log(JSON.stringify({...report,scope:'Declared complete logical journal; compare independent source counts, parents and media separately',nativeSnapshot:false}));
