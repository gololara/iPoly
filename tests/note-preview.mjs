import assert from 'node:assert/strict';
import {test} from 'node:test';
import {notePreview} from '../lib/note-preview.ts';

const capture = original => ({original, title: '', clarified: ''});
const visible = note => {const p=notePreview(note);return [p.heading,p.excerpt].filter(Boolean).join('\n');};

test('long capture appears once, with or without photos', () => {
  const original = 'Una palabra escuchada hoy.\n' + 'Contexto de la conversación para recordar y practicar después. '.repeat(3);
  for (const attachments of [[], [{id:'photo'}]]) {
    const note = {...capture(original), attachments};
    const before = structuredClone(note);
    assert.equal(visible(note), original);
    assert.deepEqual(note, before);
  }
});
test('short multiline capture keeps its second line', () => {
  assert.equal(visible(capture('A e din cilin?\n¿Sabes cuál?')), 'A e din cilin?\n¿Sabes cuál?');
});
test('preview does not slice words or Unicode at the old 95-character boundary', () => {
  const original = 'ë'.repeat(94) + '📷\nContexto';
  assert.equal(visible(capture(original)), original);
});
test('photo-only capture retains its fallback', () => {
  assert.equal(visible(capture('')), 'Un recuerdo en imágenes');
});
test('explicit title and different clarification are both retained', () => {
  assert.equal(visible({title:'Pantalla',original:'e kran',clarified:'ekran: pantalla'}), 'Pantalla\nekran: pantalla');
});
test('explicit title falls back to original if there is no clarification', () => {
  assert.equal(visible({...capture('Texto original'),title:'Mi título'}), 'Mi título\nTexto original');
});
test('identical title and preview are not displayed twice', () => {
  assert.equal(visible({...capture('ekran'),title:'ekran'}), 'ekran');
  assert.equal(visible({original:'e kran',title:'ekran',clarified:'ekran'}), 'ekran');
});
test('intentional repetitions and whitespace within the original survive', () => {
  const original = '  Mirë!\nMirë!  ';
  assert.equal(visible(capture(original)), original);
});

test('audio-only note keeps an audio-specific preview',()=>{
 const preview=notePreview({title:'',original:'',clarified:'',attachments:[{mime:'audio/mp4'}]});
 assert.equal(preview.heading,'Un recuerdo en audio');
});
