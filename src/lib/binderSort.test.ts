/* =====================================================================
   CHECKS FOR SORTING A BINDER'S CARDS BY PRICE CHANGE
   Run with:  node --test src/lib/binderSort.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BINDER_SORTS, PRISM_SORTS, canReverse, headerFor, sortEntries } from './binderSort.ts';

// A card that was added at the given price (none: no price written), keyed by its name
const card = (name: string, added?: string, currency?: string) => ({
  key: name,
  card: { name, set: 'tst', number: '1', face: 0, image: '', ...(added ? { extra: { 'Purchase price': added, ...(currency ? { 'Purchase price currency': currency } : {}) } } : {}) },
}) as never;
// Today's price of one copy of each
const prices = new Map<string, number | null>([['up', 1.5], ['down', 1.5], ['flat', 1], ['none', 1], ['euro', 1], ['noprice', null]]);
const entries = [card('down', '2.00'), card('none'), card('up', '1.00'), card('euro', '1.00', 'EUR'), card('noprice', '1.00'), card('flat', '1.00')];
const names = (list: { key: string }[]) => list.map((e) => e.key);

test('"Gainers" puts the biggest gain first and "Losers" the biggest loss first; cards with no percent are last either way', () => {
  assert.deepEqual(names(sortEntries(entries, 'change', false, { prices, currency: 'USD' })), ['up', 'flat', 'down', 'euro', 'none', 'noprice']);
  assert.deepEqual(names(sortEntries(entries, 'change', true, { prices, currency: 'USD' })), ['down', 'flat', 'up', 'euro', 'none', 'noprice']);
});

test('the price change sort is in the menu, can be reversed, and PRISM does not have it', () => {
  assert.ok(BINDER_SORTS.some((s) => s.value === 'change' && s.short === 'Gainers' && s.reversedShort === 'Losers'));
  assert.ok(canReverse('change'));
  assert.ok(!PRISM_SORTS.some((s) => (s.value as string) === 'change'));
});

// The card number sort (only offered on a set's page): counts up like a person would (2 before 10, 12 before 12a)
test('"Card number" sorts by collector number, can be reversed, and is not in the binder or PRISM menus', () => {
  const numbered = ['10', '2', '12a', '12', '1'].map((number) => ({ key: number, card: { name: 'x', set: 'tst', number, face: 0, image: '' } }) as never);
  assert.deepEqual(names(sortEntries(numbered, 'number')), ['1', '2', '10', '12', '12a']);
  assert.deepEqual(names(sortEntries(numbered, 'number', true)), ['12a', '12', '10', '2', '1']);
  assert.equal(canReverse('number'), true);
  assert.ok(!BINDER_SORTS.some((s) => s.value === 'number'));
  assert.ok(!PRISM_SORTS.some((s) => s.value === 'number'));
});

// The owned sort (only offered on a set's page): the cards in your binders first, each group in card-number order
test('"Owned first" puts the cards you own first (flipped: the missing ones), each group by card number, with Owned / Not owned headers', () => {
  const cards = ['5', '2', '10', '1', '7'].map((number) => ({ key: number, card: { name: 'x', set: 'trk', number, face: 0, image: '' } }) as never);
  const owned = new Map([['trk/10', 2], ['trk/2', 1]]);
  assert.deepEqual(names(sortEntries(cards, 'owned', false, { owned })), ['2', '10', '1', '5', '7']);
  assert.deepEqual(names(sortEntries(cards, 'owned', true, { owned })), ['1', '5', '7', '2', '10']);
  assert.equal(canReverse('owned'), true);
  assert.ok(!BINDER_SORTS.some((s) => s.value === 'owned'));
  assert.ok(!PRISM_SORTS.some((s) => s.value === 'owned'));
  const group = (key: string) => headerFor(cards.find((c: { key: string }) => c.key === key) as never, 'owned', { owned });
  assert.deepEqual([group('10'), group('1')].map((h) => (h as { text: string }).text), ['Owned', 'Not owned']);
});
