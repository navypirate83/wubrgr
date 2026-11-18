/* =====================================================================
   CHECKS FOR THE CARD NAME SEARCH
   Run with:  node --test src/lib/nameSearch.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { scryfallWordQuery } from './nameSearch.ts';

test('one letter makes a search for names with a word starting with it', () => {
  assert.equal(scryfallWordQuery('a'), 'name:/\\ba/');
});

test('every typed word must start a word in the name', () => {
  assert.equal(scryfallWordQuery('bol lightn'), 'name:/\\bbol/ name:/\\blightn/');
});

test('capitals, accents and punctuation are tidied away', () => {
  assert.equal(scryfallWordQuery("  Séance, Lim-Dûl's "), 'name:/\\bseance/ name:/\\blim/ name:/\\bduls/');
});

test('nothing typed means no search', () => {
  assert.equal(scryfallWordQuery(''), '');
  assert.equal(scryfallWordQuery('  ?! '), '');
});
