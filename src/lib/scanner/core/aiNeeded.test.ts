/* =====================================================================
   CHECKS FOR "IS THE AI WORTH RUNNING?"
   Run with:  node --test src/lib/scanner/core/aiNeeded.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_SKIP_LEAD, aiIsNeeded, artworkLead } from './aiNeeded.ts';
import { LIKELY_LEAD, rankCandidates } from './rank.ts';

// Printings with their artwork keys, and some ranking scores for them
const three = [{ id: 'a', art: 'x' }, { id: 'b', art: 'y' }, { id: 'c', art: 'z' }];
const scoresOf = (list: [string, number][]) => new Map(list);

test('one artwork among the printings: the AI is never needed, whatever the scores', () => {
  const same = [{ id: 'a', art: 'x' }, { id: 'b', art: 'x' }, { id: 'c', art: 'x' }];
  assert.equal(aiIsNeeded(same, scoresOf([['a', 0], ['b', 0], ['c', 0]])), false);
  assert.equal(aiIsNeeded([{ id: 'a', art: 'x' }], new Map()), false);
  assert.equal(aiIsNeeded([], new Map()), false);
});

test('several artworks and the art hash cannot separate them: the AI runs', () => {
  assert.equal(aiIsNeeded(three, scoresOf([['a', -1], ['b', -1.1], ['c', -1.5]])), true);
});

test('several artworks but one is far ahead: the AI is skipped', () => {
  assert.equal(aiIsNeeded(three, scoresOf([['a', -0.5], ['b', -1.2], ['c', -1.5]])), false);
});

test('the bar is exactly AI_SKIP_LEAD, and being just under it still runs the AI', () => {
  assert.equal(aiIsNeeded(three, scoresOf([['a', 0], ['b', -(AI_SKIP_LEAD - 0.01)], ['c', -2]])), true);
  assert.equal(aiIsNeeded(three, scoresOf([['a', 0], ['b', -AI_SKIP_LEAD], ['c', -2]])), false);
});

test('the lead is over the best printing with a DIFFERENT artwork (a reprint with the same art is not a rival)', () => {
  const list = [{ id: 'a', art: 'x' }, { id: 'a2', art: 'x' }, { id: 'b', art: 'y' }];
  // a and a2 are almost tied (same art, different set) but b is far behind: the lead is 1.0
  assert.equal(artworkLead(list, scoresOf([['a', 0], ['a2', -0.01], ['b', -1]])), 1);
  assert.equal(aiIsNeeded(list, scoresOf([['a', 0], ['a2', -0.01], ['b', -1]])), false);
  // the same thing when the best is a2
  assert.equal(artworkLead(list, scoresOf([['a', -0.01], ['a2', 0], ['b', -1]])), 1);
  assert.equal(artworkLead([{ id: 'a', art: 'x' }], new Map()), Infinity);
});

test('the bar is stricter than the ranking\'s own "likely" bar', () => {
  assert.ok(AI_SKIP_LEAD > LIKELY_LEAD);
});

test('with the real ranking: a clear art-hash winner skips the AI, a muddy one does not', () => {
  const candidates = [
    { id: 'a', setCode: 'aaa', year: 2010, border: 'black', group: 'aaa|x' },
    { id: 'b', setCode: 'bbb', year: 2012, border: 'black', group: 'bbb|y' },
    { id: 'c', setCode: 'ccc', year: 2014, border: 'black', group: 'ccc|z' },
  ];
  const printings = [{ id: 'a', art: 'x' }, { id: 'b', art: 'y' }, { id: 'c', art: 'z' }];
  // The photo's art is 30 bits off artwork x and 120 or more off the others: far ahead
  const clear = rankCandidates(candidates, { artDistances: new Map([['a', 30], ['b', 120], ['c', 140]]) });
  assert.equal(aiIsNeeded(printings, clear.scores), false);
  // 80 against 85 bits: no real difference
  const muddy = rankCandidates(candidates, { artDistances: new Map([['a', 80], ['b', 85], ['c', 90]]) });
  assert.equal(aiIsNeeded(printings, muddy.scores), true);
});
