/* =====================================================================
   TESTS: SETS THAT BELONG TOGETHER, AND A CARD THE CATALOGUE DOESN'T HAVE
   Run with: node --test src/lib/scanner/core/setFamily.test.ts
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingFromReadSet, setFamily } from './setFamily.ts';

// A few real sets: The Hobbit and the sets that hang off it, and two main sets with nothing to do with it
const parents = new Map<string, string | null>([
  ['hob', null], ['hoc', 'hob'], ['thob', 'hob'], ['ahob', 'hob'],
  ['mm3', null], ['dmr', null], ['pdmr', 'dmr'],
]);

test('a family is the main set and everything hanging off it, asked from any member', () => {
  assert.deepEqual([...setFamily('hob', parents)].sort(), ['ahob', 'hob', 'hoc', 'thob']);
  assert.deepEqual([...setFamily('HOC', parents)].sort(), ['ahob', 'hob', 'hoc', 'thob']);
  assert.deepEqual([...setFamily('mm3', parents)], ['mm3']);
  // A code the catalogue has never heard of is a family of one
  assert.deepEqual([...setFamily('zzz', parents)], ['zzz']);
});

test('a card that says HOB with no HOB printing in the catalogue is missing (the Zur the Enchanter case)', () => {
  const zurSets = ['csp', 'mm3', 'dmr', 'cmr', '2x2'];
  assert.equal(missingFromReadSet({ code: 'hob', corrected: false }, zurSets, parents), true);
});

test('a code read with one look-alike letter ("HO8" for "HOB") still counts when only one real set fits', () => {
  assert.equal(missingFromReadSet({ code: 'hob', corrected: true, ambiguous: false }, ['mm3', 'dmr'], parents), true);
});

test('a printing in the set itself, or in a sister set, is not missing', () => {
  assert.equal(missingFromReadSet({ code: 'hob', corrected: false }, ['mm3', 'hob'], parents), false);
  assert.equal(missingFromReadSet({ code: 'hob', corrected: false }, ['hoc'], parents), false);
  assert.equal(missingFromReadSet({ code: 'pdmr', corrected: false }, ['dmr'], parents), false);
});

test('nothing is claimed without an exactly read set code, or without any printings', () => {
  assert.equal(missingFromReadSet(null, ['mm3'], parents), false);
  // A code that needed look-alike letters swapped and could be more than one real set is a guess
  assert.equal(missingFromReadSet({ code: 'hob', corrected: true, ambiguous: true }, ['mm3'], parents), false);
  assert.equal(missingFromReadSet({ code: 'hob', corrected: true }, ['mm3'], parents), false);
  assert.equal(missingFromReadSet({ code: 'hob', corrected: false }, [], parents), false);
});
