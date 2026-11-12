// Test-only resolution matching the TypeScript bundler; never imported by the app.
import {registerHooks} from 'node:module';
registerHooks({
  resolve(specifier,context,nextResolve){
    try{return nextResolve(specifier,context);}catch(error){
      if(error.code!=='ERR_MODULE_NOT_FOUND'||!specifier.startsWith('.')||!context.parentURL?.startsWith(new URL('../',import.meta.url).href))throw error;
      const candidates=specifier.endsWith('.mjs')?[specifier.slice(0,-4)+'.mts']:[specifier+'.ts',specifier+'.mts'];
      for(const candidate of candidates){try{return nextResolve(candidate,context);}catch(next){if(next.code!=='ERR_MODULE_NOT_FOUND')throw next;}}
      throw error;
    }
  }
});
