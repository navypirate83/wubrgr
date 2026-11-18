/* =====================================================================
   CHECKS FOR THE CARD NAME SEARCH
   Run with:  node --test src/lib/nameSearch.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { nameHasWords, scryfallWordQuery } from './nameSearch.ts';

test('a name fits when every typed word starts one of its words', () => {
  assert.equal(nameHasWords('Aang and Katara', 'aang a'), true);
  assert.equal(nameHasWords('Aang, A Lot to Learn', 'aang a'), true);
  assert.equal(nameHasWords('Aang, Air Nomad', 'aang k'), false);
  assert.equal(nameHasWords('Séance', 'sean'), true);
  assert.equal(nameHasWords('Lightning Bolt', ''), true);
});

test('one letter makes a search for names with a word starting with it', () => {
  assert.equal(scryfallWordQuery('a'), 'name:/\\ba/ -st:memorabilia');
});

test('every typed word must start a word in the name', () => {
  assert.equal(scryfallWordQuery('bol lightn'), 'name:/\\bbol/ name:/\\blightn/ -st:memorabilia');
});

test('capitals, accents and punctuation are tidied away', () => {
  assert.equal(scryfallWordQuery("  Séance, Lim-Dûl's "), 'name:/\\bseance/ name:/\\blim/ name:/\\bduls/ -st:memorabilia');
});

test('nothing typed means no search', () => {
  assert.equal(scryfallWordQuery(''), '');
  assert.equal(scryfallWordQuery('  ?! '), '');
});
