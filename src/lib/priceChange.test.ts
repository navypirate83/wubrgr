/* =====================================================================
   CHECKS FOR THE PRICE CHANGE SHOWN IN THE LIST VIEW
   Run with:  node --test src/lib/priceChange.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { directionOf, percentText, priceChangeOf } from './priceChange.ts';

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
