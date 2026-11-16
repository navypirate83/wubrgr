/* =====================================================================
   CHECKS FOR THE "MOST SHARED, THEN BY DECK" ORDER
   Run with:  node --test src/lib/prismOrder.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deckGroupOf, orderByDecks } from './prismOrder.ts';

// A card used by these decks
const card = (name: string, ...decks: string[]) => ({ key: name.toLowerCase(), name, deckNeeds: decks.map((deckId) => ({ deckId })) });
// Slots: deck "red" is slot 1, "blue" 2, "green" 3
const SLOTS: Record<string, number> = { red: 1, blue: 2, green: 3 };
const slotOf = (id: string) => SLOTS[id];

test('shared cards come first, the most decks first, A to Z inside each count', () => {
  const cards = [card('Pair B', 'red', 'blue'), card('Triple', 'red', 'blue', 'green'), card('Pair A', 'blue', 'green'), card('Solo', 'red')];
  assert.deepEqual(orderByDecks(cards, slotOf).map((c) => c.name), ['Triple', 'Pair A', 'Pair B', 'Solo']);
});

test('cards only one deck uses come last, deck by deck in slot order, A to Z inside each deck', () => {
  const cards = [card('Green one', 'green'), card('Blue two', 'blue'), card('Red b', 'red'), card('Blue one', 'blue'), card('Red a', 'red'), card('Shared', 'red', 'green')];
  assert.deepEqual(orderByDecks(cards, slotOf).map((c) => c.name), ['Shared', 'Red a', 'Red b', 'Blue one', 'Blue two', 'Green one']);
});

test('the order follows the slots, not the order the decks were added', () => {
  const swapped = (id: string) => ({ red: 3, blue: 1, green: 2 })[id];
  const cards = [card('Red a', 'red'), card('Blue a', 'blue'), card('Green a', 'green')];
  assert.deepEqual(orderByDecks(cards, swapped).map((c) => c.name), ['Blue a', 'Green a', 'Red a']);
});

test('a deck that is not in the set goes after the others', () => {
  const cards = [card('Lost', 'gone'), card('Red a', 'red')];
  assert.deepEqual(orderByDecks(cards, slotOf).map((c) => c.name), ['Red a', 'Lost']);
});

test('the cards given are not changed', () => {
  const cards = [card('B', 'red'), card('A', 'red')];
  orderByDecks(cards, slotOf);
  assert.deepEqual(cards.map((c) => c.name), ['B', 'A']);
});

test('each card has a group for the header bars', () => {
  assert.deepEqual(deckGroupOf(card('X', 'red', 'blue', 'green')), { id: 'decks-3', count: 3, deckId: null });
  assert.deepEqual(deckGroupOf(card('X', 'red', 'blue')), { id: 'decks-2', count: 2, deckId: null });
  assert.deepEqual(deckGroupOf(card('X', 'blue')), { id: 'only-blue', count: 1, deckId: 'blue' });
});
