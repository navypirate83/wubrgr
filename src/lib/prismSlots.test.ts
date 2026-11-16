/* =====================================================================
   CHECKS FOR MOVING A DECK TO ANOTHER SLOT
   Run with:  node --test src/lib/prismSlots.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { clearScrape, moveSlot, takeSlot } from './prismSlots.ts';
import type { PrismSet } from './prismStorage.ts';

// A set with decks A (slot 1) and B (slot 2); Sol Ring has two copies painted (copy 1: A and B, copy 2: A)
const base = (): PrismSet => ({
  id: 's', name: 'Set', corner: 1, pins: [], names: {}, editedAt: 0, scrape: {},
  decks: [{ deckId: 'A', slot: 1 }, { deckId: 'B', slot: 2 }],
  painted: { 'sol ring': [['A', 'B'], ['A']], island: [['B']] },
});

test('a deck with painted marks moves to a free slot: the old marks are noted to scrape, the card is no longer painted for it', () => {
  const moved = moveSlot(base(), 'A', 5);
  assert.deepEqual(moved.decks, [{ deckId: 'A', slot: 5 }, { deckId: 'B', slot: 2 }]);
  assert.deepEqual(moved.painted['sol ring'], [['B'], []]);
  assert.deepEqual(moved.scrape, { 'sol ring': [[1], [1]] });
  // A card the deck wasn't painted on is untouched
  assert.deepEqual(moved.painted.island, [['B']]);
});

test('a slot another deck is in cannot be taken, and an unknown deck or the same slot changes nothing', () => {
  const set = base();
  assert.equal(moveSlot(set, 'A', 2), set);
  assert.equal(moveSlot(set, 'A', 1), set);
  assert.equal(moveSlot(set, 'nobody', 7), set);
});

test('a deck with nothing painted just moves', () => {
  const set = { ...base(), painted: {} };
  const moved = moveSlot(set, 'A', 30);
  assert.deepEqual(moved.decks[0], { deckId: 'A', slot: 30 });
  assert.deepEqual(moved.scrape, {});
});

test('moving back to the old slot puts the marks back as painted and clears the notes', () => {
  const there = moveSlot(base(), 'A', 5);
  const back = moveSlot(there, 'A', 1);
  assert.deepEqual(back.scrape, {});
  assert.deepEqual(back.painted['sol ring'].map((decks) => [...decks].sort()), [['A', 'B'], ['A']]);
});

test('another deck moving into the slot a deck left takes over the marks left in it', () => {
  const left = moveSlot(base(), 'A', 5);
  const taken = takeSlot({ ...left, decks: [...left.decks, { deckId: 'C', slot: 1 }] }, 'C', 1);
  assert.deepEqual(taken.scrape, {});
  assert.deepEqual(taken.painted['sol ring'].map((decks) => [...decks].sort()), [['B', 'C'], ['C']]);
});

test('moving twice keeps the very first slot to scrape, and notes nothing new', () => {
  const twice = moveSlot(moveSlot(base(), 'A', 5), 'A', 6);
  assert.deepEqual(twice.scrape, { 'sol ring': [[1], [1]] });
  assert.deepEqual(twice.decks[0], { deckId: 'A', slot: 6 });
});

test('marking a copy done clears only that copy\'s notes', () => {
  const moved = moveSlot(base(), 'A', 5);
  assert.deepEqual(clearScrape(moved, 'sol ring', 0), { 'sol ring': [[], [1]] });
  assert.deepEqual(clearScrape({ ...moved, scrape: { 'sol ring': [[1], []] } }, 'sol ring', 0), {});
});

test('the set given is never changed in place', () => {
  const set = base();
  const before = JSON.stringify(set);
  moveSlot(set, 'A', 5);
  assert.equal(JSON.stringify(set), before);
});
