import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanClipboardCifra} from '../src/cifraclub-import.js';

test('strips common Cifra Club site chrome lines from a raw clipboard paste', () => {
  const dirty = [
    'Cifra Club',
    'Versão 1',
    'Simplificar',
    'Am   F   C   G',
    'Let it be, let it be',
    'Auto Rolagem',
    'Capo na 3a casa',
    'Transpor: +2'
  ].join('\n');
  assert.equal(cleanClipboardCifra(dirty), 'Am   F   C   G\nLet it be, let it be');
});

test('drops inline ">>" separators without touching the surrounding text', () => {
  const dirty = 'Am   F >> C   G\nWhisper words of wisdom';
  assert.equal(cleanClipboardCifra(dirty), 'Am   F C   G\nWhisper words of wisdom');
});

test('normalizes non-breaking spaces and collapses excess blank lines', () => {
  const dirty = 'C  G\n\n\n\nLyric line';
  assert.equal(cleanClipboardCifra(dirty), 'C  G\n\nLyric line');
});

test('leaves an already-clean cifra untouched', () => {
  const clean = '[Verse]\nAm   F   C   G\nLet it be, let it be';
  assert.equal(cleanClipboardCifra(clean), clean);
});
