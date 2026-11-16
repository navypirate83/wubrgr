/* =====================================================================
   CHECKS FOR COMMANDER POWER BRACKETS
   Run with:  node --test src/lib/deckBrackets.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BRACKETS, bracketName, bracketPart, bracketText, cleanBracket, hasBrackets } from './deckBrackets.ts';

test('there are five brackets, 1 to 5, weakest first', () => {
  assert.deepEqual(BRACKETS.map((b) => b.n), [1, 2, 3, 4, 5]);
  assert.equal(bracketName(1), 'Exhibition');
  assert.equal(bracketName(5), 'cEDH');
});

test('only a whole number from 1 to 5 counts; anything else is not rated', () => {
  assert.equal(cleanBracket(3), 3);
  for (const bad of [0, 6, 2.5, '3', null, undefined, NaN]) assert.equal(cleanBracket(bad), undefined);
});

test('how a bracket is written, and nothing for a deck that is not rated', () => {
  assert.equal(bracketText(3), 'Bracket 3 · Upgraded');
  assert.equal(bracketText(undefined), '');
  assert.equal(bracketName(undefined), 'Not rated');
});

test('only Commander decks have brackets', () => {
  assert.equal(hasBrackets('commander'), true);
  for (const other of ['oathbreaker', 'duel', 'paupercommander', 'modern', undefined]) assert.equal(hasBrackets(other), false);
});

test('a deck with no bracket has the same sync fingerprint pieces as before brackets existed', () => {
  assert.deepEqual(bracketPart(undefined), []);
  assert.deepEqual(bracketPart(4), [4]);
});
