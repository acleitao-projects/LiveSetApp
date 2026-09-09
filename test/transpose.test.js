import test from 'node:test';
import assert from 'node:assert/strict';
import {transposeChordToken,transposeChordLine} from '../src/transpose.js';

test('basic triads shift by semitones', () => {
  assert.equal(transposeChordToken('C', 2), 'D');
  assert.equal(transposeChordToken('G', -1), 'F#');
  assert.equal(transposeChordToken('Bb', 1), 'B');
});

test('minor/seventh qualities preserved', () => {
  assert.equal(transposeChordToken('Am', 3), 'Cm');
  assert.equal(transposeChordToken('D7', 5), 'G7');
  assert.equal(transposeChordToken('Fmaj7', 2), 'Gmaj7');
  assert.equal(transposeChordToken('Cadd9', 2), 'Dadd9');
});

test('slash-chord bass is transposed too', () => {
  assert.equal(transposeChordToken('G/B', 2), 'A/C#');
  assert.equal(transposeChordToken('D/F#', -2), 'C/E');
});

test('flat preference is respected when requested', () => {
  assert.equal(transposeChordToken('C', 1, {prefer:'flat'}), 'Db');
  assert.equal(transposeChordToken('A', 1, {prefer:'flat'}), 'Bb');
});

test('non-chord tokens pass through unchanged', () => {
  assert.equal(transposeChordToken('hello', 2), 'hello');
  assert.equal(transposeChordToken('||:', 2), '||:');
});

test('zero semitones is an identity', () => {
  assert.equal(transposeChordLine('Am    F    C    G', 0), 'Am    F    C    G');
});

test('line transposition preserves whitespace positions', () => {
  const line = 'Am        F             C';
  const shifted = transposeChordLine(line, 2);
  // Am→Bm, F→G, C→D. Whitespace segments preserved verbatim between tokens.
  assert.match(shifted, /^Bm\s+G\s+D$/);
  const parts = shifted.split(/(\s+)/);
  const origParts = line.split(/(\s+)/);
  // Even-indexed segments are tokens; odd-indexed are whitespace segments preserved as-is
  for (let i = 1; i < parts.length; i += 2) assert.equal(parts[i], origParts[i]);
});

test('wraps around the octave', () => {
  assert.equal(transposeChordToken('B', 1), 'C');
  assert.equal(transposeChordToken('C', -1), 'B');
  assert.equal(transposeChordToken('G', 12), 'G');
});

test('Brazilian 7M / 9M notation is preserved', () => {
  assert.equal(transposeChordToken('F7M', 2), 'G7M');
  assert.equal(transposeChordToken('Am7M', 3), 'Cm7M');
  assert.equal(transposeChordToken('C9M', -1), 'B9M');
});

test('parenthesized extensions are preserved through transpose', () => {
  assert.equal(transposeChordToken('E7(4)', 5), 'A7(4)');
  assert.equal(transposeChordToken('E7(9)', 2), 'F#7(9)');
  assert.equal(transposeChordToken('E7(b9)', 2), 'F#7(b9)');
  assert.equal(transposeChordToken('Am7(9)', 2), 'Bm7(9)');
});

test('extended chords (9/11/13) shift by semitones', () => {
  assert.equal(transposeChordToken('Am9', 2), 'Bm9');
  assert.equal(transposeChordToken('C13', 5), 'F13');
});
