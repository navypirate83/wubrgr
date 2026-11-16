/* =====================================================================
   CHECKS FOR SORTING THE SHELF
   Run with:  node --test src/lib/shelfSort.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedShelfTexts, movedBy, parseShelfSort, pickedShelfSort, shelfGroup, sortShelf, withShelfHeaders, type ShelfItem,
} from './shelfSort.ts';

const item = (id: string, name: string, more: Partial<ShelfItem> = {}): ShelfItem => ({ id, name, ...more });
const ids = (items: ShelfItem[]) => items.map((i) => i.id);

test('a page with no saved choice, or a choice it does not have, is "My own order"', () => {
  assert.deepEqual(parseShelfSort('decks', undefined), { sort: 'mine', reversed: false });
  assert.deepEqual(parseShelfSort('binders', 'format'), { sort: 'mine', reversed: false });
  assert.deepEqual(parseShelfSort('decks', 'format:r'), { sort: 'format', reversed: true });
  assert.deepEqual(parseShelfSort('decks', 'mine:r'), { sort: 'mine', reversed: false });
});

test('My own order leaves the items exactly as they are', () => {
  const items = [item('b', 'Beta'), item('a', 'Alpha')];
  assert.deepEqual(ids(sortShelf('lists', items, 'mine')), ['b', 'a']);
});

test('name sorts A to Z ignoring symbol braces, and reverses', () => {
  const items = [item('1', 'Zebra'), item('2', '{R} Burn'), item('3', 'apple')];
  assert.deepEqual(ids(sortShelf('binders', items, 'name')), ['3', '2', '1']);
  assert.deepEqual(ids(sortShelf('binders', items, 'name:r')), ['1', '2', '3']);
});

test('most cards first, then the other way round', () => {
  const items = [item('a', 'A', { cards: 5 }), item('b', 'B', { cards: 50 }), item('c', 'C', { cards: 20 })];
  assert.deepEqual(ids(sortShelf('lists', items, 'cards')), ['b', 'c', 'a']);
  assert.deepEqual(ids(sortShelf('lists', items, 'cards:r')), ['a', 'c', 'b']);
});

test('recently opened puts the latest first; never opened goes last', () => {
  const items = [item('a', 'A', { used: 0 }), item('b', 'B', { used: 300 }), item('c', 'C', { used: 900 })];
  assert.deepEqual(ids(sortShelf('decks', items, 'used')), ['c', 'b', 'a']);
});

test('Not legal first puts the decks with a problem on top, by name inside each group', () => {
  const items = [item('a', 'Ant', { legal: true }), item('b', 'Bee', { legal: false }), item('c', 'Cat', { legal: true }), item('d', 'Dog', { legal: false })];
  assert.deepEqual(ids(sortShelf('decks', items, 'legal')), ['b', 'd', 'a', 'c']);
  assert.deepEqual(ids(sortShelf('decks', items, 'legal:r')), ['c', 'a', 'd', 'b']);
});

test('format groups together, A to Z by name inside each format', () => {
  const items = [item('1', 'Zed', { format: 'Modern' }), item('2', 'Amy', { format: 'Commander' }), item('3', 'Bob', { format: 'Modern' })];
  assert.deepEqual(ids(sortShelf('decks', items, 'format')), ['2', '3', '1']);
});

test('PRISM sets: most work waiting first', () => {
  const items = [item('a', 'A', { work: 0 }), item('b', 'B', { work: 31 }), item('c', 'C', { work: 14 })];
  assert.deepEqual(ids(sortShelf('prisms', items, 'work')), ['b', 'c', 'a']);
});

test('the items given are not changed', () => {
  const items = [item('b', 'B'), item('a', 'A')];
  sortShelf('binders', items, 'name');
  assert.deepEqual(ids(items), ['b', 'a']);
});

test('picking the sort in use flips it; picking another starts in its usual direction', () => {
  assert.equal(pickedShelfSort('decks', 'name', 'name'), 'name:r');
  assert.equal(pickedShelfSort('decks', 'name:r', 'name'), 'name');
  assert.equal(pickedShelfSort('decks', 'name:r', 'cards'), 'cards');
  assert.equal(pickedShelfSort('decks', 'mine', 'mine'), 'mine');
  assert.equal(pickedShelfSort('decks', 'name', 'nonsense'), 'mine');
});

test('groups for header bars', () => {
  assert.equal(shelfGroup('binders', 'name', item('1', '{R} Burn')), 'R');
  assert.equal(shelfGroup('binders', 'name', item('1', '1st Deck')), '#');
  assert.equal(shelfGroup('decks', 'legal', item('1', 'X', { legal: false })), 'Not legal');
  assert.equal(shelfGroup('decks', 'format', item('1', 'X', { format: 'Modern' })), 'Modern');
  assert.equal(shelfGroup('prisms', 'work', item('1', 'X', { work: 3 })), 'Marks waiting');
  assert.equal(shelfGroup('lists', 'cards', item('1', 'X')), null);
});

test('header bars come before each new group, and not when switched off or the sort has no groups', () => {
  const items = [item('1', 'Apple'), item('2', 'Avocado'), item('3', 'Banana')];
  const rows = withShelfHeaders('lists', sortShelf('lists', items, 'name'), 'name', true);
  assert.deepEqual(rows.map((r) => (r.kind === 'header' ? `#${r.text}` : r.item.id)), ['#A', '1', '2', '#B', '3']);
  assert.equal(withShelfHeaders('lists', items, 'name', false).every((r) => r.kind === 'item'), true);
  assert.equal(withShelfHeaders('lists', items, 'cards', true).every((r) => r.kind === 'item'), true);
});

test('moving an item up or down swaps it with its neighbor and stops at the ends', () => {
  const items = [item('a', 'A'), item('b', 'B'), item('c', 'C')];
  assert.deepEqual(ids(movedBy(items, 'b', -1)), ['b', 'a', 'c']);
  assert.deepEqual(ids(movedBy(items, 'b', 1)), ['a', 'c', 'b']);
  assert.deepEqual(ids(movedBy(items, 'a', -1)), ['a', 'b', 'c']);
  assert.deepEqual(ids(movedBy(items, 'c', 1)), ['a', 'b', 'c']);
  assert.deepEqual(ids(movedBy(items, 'zzz', 1)), ['a', 'b', 'c']);
});

test('the texts the server may accept', () => {
  assert.ok(allowedShelfTexts('decks').includes('legal:r'));
  assert.ok(allowedShelfTexts('decks').includes('mine'));
  assert.ok(!allowedShelfTexts('decks').includes('mine:r'));
  assert.ok(!allowedShelfTexts('binders').includes('format'));
});
