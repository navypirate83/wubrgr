/* =====================================================================
   CHECKS FOR THE SETS TAB'S LIST AND SEARCH
   Run with:  node --test src/lib/setList.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetList, filterSets, fuzzyMatches, type SetInfo } from './setList.ts';

// A set with sensible blanks
const set = (code: string, name: string, type: string, released: string, parent: string | null = null, digital = false): SetInfo =>
  ({ code, name, type, parent, count: 10, released, digital, icon: '' });

const SETS: SetInfo[] = [
  set('trc', 'Star Trek Commander', 'commander', '2024-03-01', 'trk'),
  set('ttrc', 'Star Trek Commander Tokens', 'token', '2024-03-01', 'trc'),
  set('trk', 'Star Trek', 'expansion', '2024-03-01'),
  set('ttrk', 'Star Trek Tokens', 'token', '2024-03-01', 'trk'),
  set('blb', 'Bloomburrow', 'expansion', '2024-08-02'),
  set('yblb', 'Alchemy: Bloomburrow', 'alchemy', '2024-08-20', 'blb', true),
  set('tsp', 'Time Spiral', 'expansion', '2006-10-06'),
  set('tsb', 'Time Spiral Timeshifted', 'expansion', '2006-10-06', 'tsp'),
  set('odd', 'Orphan Extra', 'token', '2020-01-01', 'gone'),
];

test('main sets come newest first, and extras sit under their main set', () => {
  const list = buildSetList(SETS);
  assert.deepEqual(list.map((s) => s.code), ['blb', 'trk', 'odd', 'tsp']);
});

test('tokens come before Commander, and a Commander set\'s tokens sit under it', () => {
  const trk = buildSetList(SETS).find((s) => s.code === 'trk')!;
  assert.deepEqual(trk.kids.map((k) => [k.code, k.depth]), [['ttrk', 1], ['trc', 1], ['ttrc', 2]]);
});

test('digital-only sets are left out', () => {
  const blb = buildSetList(SETS).find((s) => s.code === 'blb')!;
  assert.deepEqual(blb.kids, []);
});

test('a set whose main set is missing stands on its own', () => {
  assert.ok(buildSetList(SETS).some((s) => s.code === 'odd'));
});

test('the fuzzy search forgives typos, part-words and letters in order', () => {
  assert.ok(fuzzyMatches('bloomburo', 'Bloomburrow'));
  assert.ok(fuzzyMatches('trek cmdr', 'Star Trek Commander'));
  assert.ok(fuzzyMatches('drag', 'Tarkir: Dragonstorm'));
  assert.ok(!fuzzyMatches('zendikar', 'Bloomburrow'));
  assert.ok(fuzzyMatches('', 'anything'));
});

test('a search that only matches an extra opens that set\'s extras', () => {
  const nodes = buildSetList(SETS);
  const found = filterSets(nodes, 'timeshift');
  assert.equal(found.length, 1);
  assert.equal(found[0].node.code, 'tsp');
  assert.equal(found[0].open, true);
  assert.deepEqual([...found[0].hits], ['tsb']);
});

test('a search that matches the main set by name leaves its extras closed', () => {
  const found = filterSets(buildSetList(SETS), 'star trek');
  assert.equal(found.length, 1);
  assert.equal(found[0].open, false);
});
