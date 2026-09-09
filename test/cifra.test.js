import test from 'node:test';import assert from 'node:assert/strict';
import {parseCifra,isChordToken} from '../src/cifra.js';
import {resolveChord,chordDiagramSvg} from '../src/chords.js';

test('cifra parser preserves source and pairs chord lines above lyrics',()=>{const source='[Verse]\r\nAm        F             C\r\nSome lyric text\r\n\r\nplain';const parsed=parseCifra(source);assert.equal(parsed.source,source);assert.equal(parsed.rows[0].type,'section');assert.equal(parsed.rows[1].type,'pair');assert.equal(parsed.rows[1].chord.text,'Am        F             C');assert.deepEqual(parsed.uniqueChords,['Am','F','C']);});
test('common chord grammar and plain lyric fallback',()=>{for(const chord of ['C','Cm','C7','Cmaj7','C#m','F#','Bb','Am7','G/B','Cadd9','Dsus4'])assert.equal(isChordToken(chord),true,chord);assert.equal(parseCifra('This is plain lyrics').rows[0].type,'lyrics');});
test('offline resolver renders common diagrams and gracefully rejects unknown symbols',()=>{assert.ok(resolveChord('Am7'));assert.ok(resolveChord('F#'));assert.deepEqual(resolveChord('C#m7').frets,['x',4,6,4,5,4]);assert.deepEqual(resolveChord('Ebm7').frets,['x',6,8,6,7,6]);assert.match(chordDiagramSvg('C#m7'),/<svg/);assert.match(chordDiagramSvg('Cadd9'),/<svg/);assert.equal(resolveChord('H13'),null);assert.equal(chordDiagramSvg('H13'),'');});
