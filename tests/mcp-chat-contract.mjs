import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Frozen schemas and annotations are shipped as a data-only compatibility fixture.
const prior=JSON.parse(await readFile(new URL('./fixtures/compatibility/mcp-v23-contract.json',import.meta.url),'utf8'));
const retired=['ipoly_proponer_debriefing','ipoly_aplicar_debriefing','ipoly_proponer_preparacion','ipoly_proponer_cierre','ipoly_aplicar_propuesta_tutor'];
const retained=prior.filter(t=>!retired.includes(t.name));
assert.equal(prior.length,24);
assert.equal(retained.length,19);

export function assertRetainedMcpContract(actual){
 assert.equal(actual.length,21);
 assert.deepEqual(actual.map(t=>t.name).sort(),[...retained.map(t=>t.name),'ipoly_anadir_idioma','ipoly_maestros'].sort());
 assert.equal(actual.find(t=>t.name==='ipoly_maestros').annotations.readOnlyHint,true);
 const added=actual.find(t=>t.name==='ipoly_anadir_idioma');
 assert.equal(added.annotations.readOnlyHint,false);
 assert.equal(added.inputSchema.properties.confirmed.const,true);
 for(const old of retained){
  const current=actual.find(t=>t.name===old.name);
  // Only the note language enum is widened; all other parameters and risk hints stay fixed.
  const oldContract=structuredClone(old);
  const {description:newDescription,...newContract}=structuredClone(current);
  if(['ipoly_notas','ipoly_guardar_nota'].includes(old.name)){
   const filter=old.name==='ipoly_notas';
   const pattern=new RegExp(newContract.inputSchema.properties.language.pattern);
   for(const lang of oldContract.inputSchema.properties.language.enum)assert.ok(pattern.test(lang));
   assert.ok(pattern.test('lang-0123456789abcdef01234567'));
   assert.equal(pattern.test('all'),filter);
   assert.equal(pattern.test('unknown'),false);
   delete newContract.inputSchema.properties.language.pattern;
   delete newContract.inputSchema.properties.language.type;
   delete oldContract.inputSchema.properties.language.enum;
  }
  assert.deepEqual(newContract,oldContract,old.name+' retains other inputs and published risk annotations');
  assert.ok(newDescription.length);
 }
 assert.equal(actual[0].name,'ipoly_estado');
 assert.equal(actual[1].name,'ipoly_memoria');
 return {retainedSchemasAndAnnotations:19,retiredTools:retired};
}
