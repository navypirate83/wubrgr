/* =====================================================================
   CHECKS FOR USING THE COLLECTOR NUMBER AS A CLUE
   Run with:  node --test src/lib/scanner/core/numberClue.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { numberBonus, numberFit, tidyNumber, NUMBER_EXACT_BONUS, NUMBER_NEAR_BONUS, SET_MATCH_BONUS } from './numberClue.ts';

test('leading zeros and capitals are ignored when comparing numbers', () => {
  assert.equal(tidyNumber('0123'), '123');
  assert.equal(tidyNumber('12A'), '12a');
  assert.equal(tidyNumber('0'), '0');
  assert.equal(numberFit('0375', '375'), 'exact');
});

test('a number one digit off is "near", two digits off is not', () => {
  assert.equal(numberFit('378', '375'), 'near');
  assert.equal(numberFit('388', '375'), 'none');
  assert.equal(numberFit('37', '375'), 'none');
});

test('a number that lost its first digit is a "tail" (but one digit alone is not)', () => {
  assert.equal(numberFit('49', '249'), 'tail');
  assert.equal(numberFit('049', '249'), 'tail');
  assert.equal(numberFit('9', '49'), 'none');
  assert.equal(numberFit('49', '1249'), 'none');
  assert.equal(numberFit('49', '250'), 'none');
});

test('a short number one digit off is not "near" (too many cards share it)', () => {
  assert.equal(numberFit('5', '6'), 'none');
});

test('numbers with letters or symbols need to match exactly', () => {
  assert.equal(numberFit('45★', '45★'), 'exact');
  assert.equal(numberFit('45a', '45b'), 'none');
});

test('nothing read gives no bonus', () => {
  assert.equal(numberBonus(null, null, { collectorNumber: '375', setCode: 'who' }), 0);
});

test('the exact number plus the right set adds up, and the wrong set adds nothing for the set', () => {
  assert.equal(numberBonus('375', 'who', { collectorNumber: '375', setCode: 'WHO' }), NUMBER_EXACT_BONUS + SET_MATCH_BONUS);
  assert.equal(numberBonus('375', 'mh2', { collectorNumber: '375', setCode: 'who' }), NUMBER_EXACT_BONUS);
  assert.equal(numberBonus('378', null, { collectorNumber: '375', setCode: 'who' }), NUMBER_NEAR_BONUS);
});

import { NUMBER_LETTER_BONUS } from './numberClue.ts';

test('the right digits with a stray letter on the end ("320f" for 320) are a strong match, but not a full one', () => {
  assert.equal(numberFit('320f', '320'), 'letter');
  assert.equal(numberBonus('320f', null, { collectorNumber: '320', setCode: 'fin' }), NUMBER_LETTER_BONUS);
  assert.ok(NUMBER_LETTER_BONUS < NUMBER_EXACT_BONUS);
  assert.equal(numberFit('320f', '320a'), 'none');
});
