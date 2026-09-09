import test from 'node:test';
import assert from 'node:assert/strict';
import {newSetlist,trackItem,breakItem} from '../src/models.js';
import {insertAfter,removeItem,moveItem,resolveNext,resolvePrevious,totalDurationSeconds,formatDuration} from '../src/setlist.js';

test('mutations and navigation use stable item ids', () => {
  const s = newSetlist();
  const a = trackItem('a'), b = trackItem('b'), c = trackItem('c');
  s.items = [a, b, c];
  insertAfter(s, a.id, breakItem());
  assert.equal(s.items[1].type, 'break');
  moveItem(s, c.id, 0);
  assert.equal(resolveNext(s, c.id).songId, 'a');
  removeItem(s, a.id);
  assert.equal(resolvePrevious(s, c.id), undefined);
});

test('active item removal resolves next from current working sequence', () => {
  const s = newSetlist();
  const a = trackItem('a'), b = trackItem('b'), c = trackItem('c');
  s.items = [a, b, c];
  removeItem(s, b.id);
  assert.equal(resolveNext(s, b.id, [a.id, b.id, c.id]).songId, 'c');
});

test('setlist duration sums songs and breaks and is order-independent', () => {
  const s = newSetlist();
  const a = trackItem('a'), b = trackItem('b'), br = breakItem('Break', 15);
  s.items = [a, b, br];
  const songs = new Map([['a', {durationSeconds: 210}], ['b', {durationSeconds: 240}]]);
  assert.equal(totalDurationSeconds(s, songs), 1350);
  assert.equal(formatDuration(1350), '22:30');
  moveItem(s, br.id, 0);
  assert.equal(totalDurationSeconds(s, songs), 1350);
});

test('duration formats hours with HH:MM:SS', () => assert.equal(formatDuration(5530), '1:32:10'));

test('duration recalculates after add/remove/edit', () => {
  const s = newSetlist();
  const a = trackItem('a');
  const songs = new Map([['a', {durationSeconds: 60}], ['b', {durationSeconds: 120}]]);
  s.items = [a];
  assert.equal(totalDurationSeconds(s, songs), 60);
  s.items.push(trackItem('b'));
  assert.equal(totalDurationSeconds(s, songs), 180);
  const br = breakItem('Break', 5);
  s.items.push(br);
  assert.equal(totalDurationSeconds(s, songs), 480);
  br.durationMinutes = 2;
  assert.equal(totalDurationSeconds(s, songs), 300);
  removeItem(s, br.id);
  assert.equal(totalDurationSeconds(s, songs), 180);
});
