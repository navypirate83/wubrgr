/* =====================================================================
   CHECKS FOR THE SCANNER'S OPTIONS AND THE SET LOCK
   Run with:  node --test src/lib/scanner/core/scanOptions.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCAN_OPTIONS, cleanScanOptions } from './scanOptions.ts';
import { applySetLock } from './setLock.ts';

test('nothing saved gives the usual options, with no lock', () => {
  assert.deepEqual(cleanScanOptions(undefined), DEFAULT_SCAN_OPTIONS);
  assert.deepEqual(cleanScanOptions(null), DEFAULT_SCAN_OPTIONS);
  assert.deepEqual(cleanScanOptions('junk'), DEFAULT_SCAN_OPTIONS);
  assert.equal(DEFAULT_SCAN_OPTIONS.lockedSet, null);
});

test('good saved values are kept', () => {
  const kept = cleanScanOptions({ lockedSet: { code: 'dom', name: 'Dominaria' }, unsure: 'guess', startFinish: 'foil', showTimings: false });
  assert.deepEqual(kept, { lockedSet: { code: 'dom', name: 'Dominaria' }, unsure: 'guess', startFinish: 'foil', showTimings: false });
});

test('a bad value falls back to the usual one without spoiling the others', () => {
  const cleaned = cleanScanOptions({ lockedSet: 5, unsure: 'maybe', startFinish: 'etched', showTimings: 'yes' });
  assert.deepEqual(cleaned, DEFAULT_SCAN_OPTIONS);
  const partly = cleanScanOptions({ unsure: 'guess', startFinish: 12 });
  assert.equal(partly.unsure, 'guess');
  assert.equal(partly.startFinish, 'nonfoil');
});

test('a locked set is lower-cased, and a missing name shows the code', () => {
  assert.deepEqual(cleanScanOptions({ lockedSet: { code: ' DOM ' } }).lockedSet, { code: 'dom', name: 'DOM' });
  assert.equal(cleanScanOptions({ lockedSet: { code: '   ', name: 'Nothing' } }).lockedSet, null);
});

// A few pretend printings of one card
const printings = [{ id: 'a', setCode: 'lea' }, { id: 'b', setCode: 'm10' }, { id: 'c', setCode: 'dom' }, { id: 'd', setCode: 'dom' }];

test('with no lock, every printing stays', () => {
  assert.deepEqual(applySetLock(printings, null), { printings, locked: false, missing: false });
  assert.deepEqual(applySetLock(printings, ''), { printings, locked: false, missing: false });
});

test('a lock keeps only that set\'s printings', () => {
  const result = applySetLock(printings, 'DOM');
  assert.deepEqual(result.printings.map((p) => p.id), ['c', 'd']);
  assert.equal(result.locked, true);
  assert.equal(result.missing, false);
});

test('a lock the card has no printing in keeps everything and says so', () => {
  const result = applySetLock(printings, 'zen');
  assert.equal(result.printings.length, 4);
  assert.equal(result.locked, false);
  assert.equal(result.missing, true);
});

test('a card with no printings at all is not "missing" from the set', () => {
  assert.deepEqual(applySetLock([], 'dom'), { printings: [], locked: false, missing: false });
});
