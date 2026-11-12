import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
if(lstatSync('node_modules').isSymbolicLink())throw Error('Local verification requires project-owned node_modules');
if(readdirSync(root).some(n=>n.startsWith('.env')||n==='.dev.vars'))throw Error('Verification requires a clean synthetic environment without environment files');
const runtime=path.join(root,'.sites-runtime/preparation');mkdirSync(runtime,{recursive:true});
for(const name of ['npm-user-empty','npm-global-empty']){try{writeFileSync(path.join(runtime,name),'',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}
const env=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','SystemRoot'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
Object.assign(env,{npm_config_userconfig:path.join(runtime,'npm-user-empty'),npm_config_globalconfig:path.join(runtime,'npm-global-empty'),npm_config_registry:'https://registry.npmjs.org/',npm_config_cache:path.join(root,'.sites-runtime/npm-cache'),CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_PATH:path.join(root,'.sites-runtime/wrangler/logs'),WRANGLER_REGISTRY_PATH:path.join(root,'.sites-runtime/wrangler/dev-registry'),MINIFLARE_REGISTRY_PATH:path.join(root,'.sites-runtime/wrangler/registry')});
const run=args=>{const r=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);};
const flags=['--experimental-strip-types','--import','./tests/register-typescript.mjs'];
// Retired teacher authoring integration scripts target the earlier product contract.
if(process.argv.includes('--legacy')){
 for(const name of ['tutor-d1-migration','tutor-revisions-d1','tutor-migration'])run([...flags,'tests/'+name+'.mjs']);
}else{
 run(['scripts/run-framework.mjs','build']);run(['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']);
 run([...flags,'--test',...['audio','class-detail-model','class-session-ui','note-preview','teacher-initials','workspace-route','memory-read-projection','memory-detail','memory-list','memory-contract','legacy-navigation'].map(n=>'tests/'+n+'.mjs')]);
 for(const name of ['class-details-d1','class-teacher-d1','teacher-profiles-d1','memory-read-integration','memory-read-review','memory-detail-integration','memory-list-integration','attribution-integration','attribution-toctou','memory-write-integration','memory-approval-adversarial','memory-v20-compatibility','memory-ledger-review','memory-media-integration','simple-classes-integration','legacy-closure-integration','legacy-final-review','legacy-teacher-access','memory-chat-approval','learning-languages-integration','ui-locale-integration','teacher-language-integration','local-smoke'])run([...flags,'tests/'+name+'.mjs']);
}
