/* =====================================================================
   CHECKS FOR COMMANDER POWER BRACKETS
   Run with:  node --test src/lib/deckBrackets.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BRACKETS, bracketAllowed, bracketName, bracketPart, bracketText, cleanBracket, countGameChangers, effectiveBracket, hasBrackets, lowestBracket } from './deckBrackets.ts';

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

const gc = (name: string) => ['sol ring', 'rhystic study'].includes(name.toLowerCase());

test('Game Changers are counted by copy, in the main deck and command zone, but not the sideboard', () => {
  const cards = [{ name: 'Sol Ring' }, { name: 'Rhystic Study', count: 1, zone: 'command' }, { name: 'Sol Ring', zone: 'side' }, { name: 'Sol Ring', zone: 'maybe' }, { name: 'Forest', count: 20 }];
  assert.equal(countGameChangers(cards, gc), 2);
  assert.equal(countGameChangers([], gc), 0);
});

test('the lowest bracket: none is 1, one to three is 3, four or more is 4', () => {
  assert.deepEqual([0, 1, 3, 4, 9].map(lowestBracket), [1, 3, 3, 4, 4]);
});

test('which brackets may be chosen with Game Changers', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => bracketAllowed(n, 0)), [true, true, true, true, true]);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => bracketAllowed(n, 2)), [false, false, true, true, true]);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => bracketAllowed(n, 4)), [false, false, false, true, true]);
});

test('a deck counts as its chosen bracket, raised to the lowest allowed when it has Game Changers', () => {
  assert.equal(effectiveBracket(undefined, 0), undefined);
  assert.equal(effectiveBracket(2, 0), 2);
  assert.equal(effectiveBracket(undefined, 2), 3);
  assert.equal(effectiveBracket(1, 2), 3);
  assert.equal(effectiveBracket(5, 2), 5);
  assert.equal(effectiveBracket(3, 4), 4);
  assert.equal(effectiveBracket(undefined, 6), 4);
});
