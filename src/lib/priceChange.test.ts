/* =====================================================================
   CHECKS FOR THE PRICE CHANGE SHOWN IN THE LIST VIEW
   Run with:  node --test src/lib/priceChange.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { directionOf, percentText, priceChangeOf, readAdded, writeAdded } from './priceChange.ts';

test('a price that went up shows a plus, one that went down a minus, two digits after the point', () => {
  assert.equal(percentText(50), '+50.00%');
  assert.equal(percentText(-25), '-25.00%');
  assert.equal(percentText(5.5555), '+5.56%');
  assert.equal(percentText(-0.004), '0.00%');
  assert.equal(percentText(0), '0.00%');
  assert.equal(percentText(1234.567), '+1234.57%');
});

test('the direction is up, down or same (a change too small to show counts as same)', () => {
  assert.equal(directionOf(0.01), 'up');
  assert.equal(directionOf(-0.01), 'down');
  assert.equal(directionOf(0.004), 'same');
  assert.equal(directionOf(0), 'same');
});

test('the percent is worked out from the added price and today\'s price', () => {
  const up = priceChangeOf({ 'Purchase price': '1.00' }, 1.5, 'USD');
  assert.equal(up?.added, 1);
  assert.equal(up?.percent, 50);
  assert.equal(priceChangeOf({ 'Purchase price': '2.00' }, 1.5, 'USD')?.percent, -25);
});

test('a card with no added price gives nothing', () => {
  assert.equal(priceChangeOf(undefined, 1.5, 'USD'), null);
  assert.equal(priceChangeOf({}, 1.5, 'USD'), null);
  assert.equal(priceChangeOf({ 'Purchase price': 'abc' }, 1.5, 'USD'), null);
});

test('no percent when there is no price today, the added price is zero, or the money differs', () => {
  assert.equal(priceChangeOf({ 'Purchase price': '1.00' }, null, 'USD')?.percent, null);
  assert.equal(priceChangeOf({ 'Purchase price': '1.00' }, undefined, 'USD')?.percent, null);
  assert.equal(priceChangeOf({ 'Purchase price': '0.00' }, 1, 'USD')?.percent, null);
  const euros = priceChangeOf({ 'Purchase price': '1.00', 'Purchase price currency': 'EUR' }, 1.5, 'USD');
  assert.equal(euros?.addedCurrency, 'EUR');
  assert.equal(euros?.percent, null);
});

test('with all the prices saved, the one picked is compared with the same one', () => {
  const notes = { 'Purchase price': '1.00', 'Added prices': writeAdded([1, 1.8, null, 2, 0.5, 1.25, 0.8, 1.3]) };
  assert.equal(priceChangeOf(notes, 1, 'USD', 4)?.percent, 100);
  assert.equal(priceChangeOf(notes, 2.5, 'EUR', 5)?.addedCurrency, 'EUR');
  assert.equal(priceChangeOf(notes, 2, 'USD', 2), null);
});

test('prices filled in later say since when, except the original one', () => {
  const notes = { 'Added prices': writeAdded([1, 2, 3, 4, 5, 6, 7, 8], '2026-11-26', 0) };
  assert.equal(priceChangeOf(notes, 1, 'USD', 0)?.since, undefined);
  assert.equal(priceChangeOf(notes, 2, 'USD', 1)?.since, '2026-11-26');
  assert.equal(readAdded(notes['Added prices'])?.values[7], 8);
});

test('one older price only stands for TCGplayer Market (or Cardmarket Trend)', () => {
  assert.equal(priceChangeOf({ 'Purchase price': '1.00' }, 1.5, 'USD', 0)?.percent, 50);
  assert.equal(priceChangeOf({ 'Purchase price': '1.00' }, 1.5, 'USD', 4), null);
});

test('the ninth price (TCGplayer High) is in dollars, and a huge note is kept short enough', () => {
  const notes = { 'Added prices': writeAdded([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  assert.equal(priceChangeOf(notes, 18, 'USD', 8)?.percent, 100);
  const huge = writeAdded(Array(9).fill(1234567.89), '2026-11-26', 0);
  assert.ok(huge.length <= 100);
  assert.ok(huge.endsWith(';2026-11-26;0'));
});
