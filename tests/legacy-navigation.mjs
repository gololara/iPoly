import assert from 'node:assert/strict';
import test from 'node:test';
import {legacyDestination} from '../lib/legacy-navigation.ts';
import {memoryClassHref} from '../lib/memory-detail.ts';
const id='40000000-0000-4000-8000-000000000013';
test('old entrances resolve to the two current sections',()=>{
 assert.equal(legacyDestination({}),'/memorias');
 assert.equal(legacyDestination({view:'memory',language:'en'}),'/memorias?language=en');
 assert.equal(legacyDestination({view:'today'}),'/memorias?history=no_debrief');
 assert.equal(legacyDestination({view:'debrief',language:'sq'}),'/memorias?language=sq&archive=debriefs');
 assert.equal(legacyDestination({view:'tutor'}),'/clases?archive=preparations');
});
test('preparation links preserve identity and language without reopening the old UI',()=>{
 assert.equal(legacyDestination({view:'tutor',preparation:id,language:'en'}),'/clases?language=en&preparation='+id);
 assert.equal(memoryClassHref(id,'sq'),'/clases?language=sq&preparation='+id);
});
test('untrusted query values cannot redirect outside iPoly or become a detail path',()=>{
 for(const preparation of ['https://foreign.example','../secrets','a'.repeat(36),''])assert.equal(legacyDestination({view:'tutor',preparation}),'/clases?archive=preparations');
 assert.equal(legacyDestination({view:['tutor'],language:'foreign'}),'/memorias');
 assert.equal(new URL(legacyDestination({q:'x'.repeat(500)}),'https://example.test').searchParams.get('q').length,300);
});
