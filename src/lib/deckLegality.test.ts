/* =====================================================================
   CHECKS FOR DECK LEGALITY
   Run with:  node --test src/lib/deckLegality.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deckProblems as problemsOf, sizeProblems as sizeOf } from './deckLegality.ts';
import { deckFormat } from './deckFormats.ts';

// The checks below read as "the problems of this deck", with the deck's own format
const sizeProblems = (d: { format: string; cards: never[] }) => sizeOf(d, deckFormat(d.format));
const deckProblems = (d: { format: string; cards: never[] }, banned: (name: string) => boolean) => problemsOf(d, deckFormat(d.format), banned);

// A deck of "n" different cards in the main deck, plus optional extras
const deck = (format: string, n: number, extra: { name: string; count?: number; zone?: 'side' | 'command' }[] = []) => ({
  format,
  cards: [...Array.from({ length: n }, (_, i) => ({ name: `Card ${i}` })), ...extra] as never[],
});

test('Commander: 100 is fine, 101 is not legal', () => {
  assert.deepEqual(sizeProblems(deck('commander', 100)), []);
  assert.deepEqual(sizeProblems(deck('commander', 101)), ['101 cards, at most 100']);
});

test('copies count, and the command zone counts too', () => {
  assert.deepEqual(sizeProblems(deck('commander', 97, [{ name: 'Sol Ring', count: 2 }, { name: 'Atraxa', zone: 'command' }])), []);
  assert.deepEqual(sizeProblems(deck('commander', 97, [{ name: 'Sol Ring', count: 3 }, { name: 'Atraxa', zone: 'command' }])), ['101 cards, at most 100']);
});

test('fewer cards than the format wants is not marked', () => {
  assert.deepEqual(sizeProblems(deck('commander', 30)), []);
  assert.deepEqual(sizeProblems(deck('commander', 0)), []);
});

test('the other limited formats: Oathbreaker 60, Tiny Leaders 50, Duel Commander 100', () => {
  assert.deepEqual(sizeProblems(deck('oathbreaker', 61)), ['61 cards, at most 60']);
  assert.deepEqual(sizeProblems(deck('tlr', 51)), ['51 cards, at most 50']);
  assert.deepEqual(sizeProblems(deck('duel', 101)), ['101 cards, at most 100']);
});

test('a format with no top limit is never marked for size, but its sideboard is limited', () => {
  assert.deepEqual(sizeProblems(deck('modern', 90)), []);
  assert.deepEqual(sizeProblems(deck('modern', 60, [{ name: 'Wasteland', count: 16, zone: 'side' }])), ['sideboard 16, at most 15']);
  assert.deepEqual(sizeProblems(deck('modern', 60, [{ name: 'Wasteland', count: 15, zone: 'side' }])), []);
});

test('a banned card makes it not legal, and says how many', () => {
  const banned = (name: string) => name === 'Card 1' || name === 'Card 2';
  assert.deepEqual(deckProblems(deck('commander', 100), banned), ['2 banned cards']);
  assert.deepEqual(deckProblems(deck('commander', 100), (name) => name === 'Card 1'), ['1 banned card']);
  assert.deepEqual(deckProblems(deck('commander', 101), banned), ['101 cards, at most 100', '2 banned cards']);
  assert.deepEqual(deckProblems(deck('commander', 100), () => false), []);
});
