import assert from 'node:assert/strict';import test from 'node:test';import {teacherInitials} from '../lib/teacher-model.ts';
test('single name produces one initial',()=>assert.equal(teacherInitials('Ejemplo'),'E'));
test('two and more words use first and last initial',()=>{assert.equal(teacherInitials('Ejemplo Uno'),'EU');assert.equal(teacherInitials('Nombre de Ejemplo'),'NE');});
test('whitespace does not affect initials',()=>assert.equal(teacherInitials('  Ejemplo    Uno  '),'EU'));
test('Unicode letters preserved',()=>{assert.equal(teacherInitials('çelë Ñame'),'ÇÑ');assert.equal(teacherInitials('李'),'李');});
test('no guessed gender or image for punctuation-only names',()=>assert.equal(teacherInitials('…'),'•'));
