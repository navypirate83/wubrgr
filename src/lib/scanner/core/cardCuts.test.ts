/* =====================================================================
   TESTS for cardCuts.ts: widening a cut-out from the inner frame to the whole card, and scoring a read.
   Run with:  npx tsx --test src/lib/scanner/core/cardCuts.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BORDER, FOUND_SCORE, FULL_SCORE, readingScore, widenToWholeCard } from './cardCuts.ts';
import type { Quad } from './perspective.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

// A card 630 x 880 standing straight: its inner frame widened must give back the card's own corners
test('an upright inner frame is widened back to the whole card', () => {
  const W = 630, H = 880;
  const inner: Quad = [
    { x: W * BORDER.left, y: H * BORDER.top },
    { x: W * (1 - BORDER.right), y: H * BORDER.top },
    { x: W * (1 - BORDER.right), y: H * (1 - BORDER.bottom) },
    { x: W * BORDER.left, y: H * (1 - BORDER.bottom) },
  ];
  const whole = widenToWholeCard(inner);
  near(whole[0].x, 0); near(whole[0].y, 0);
  near(whole[1].x, W); near(whole[1].y, 0);
  near(whole[2].x, W); near(whole[2].y, H);
  near(whole[3].x, 0); near(whole[3].y, H);
});

// The bottom grows more than the top (the bottom border is the thick one, where the collector number is)
test('the bottom is widened more than the top', () => {
  const inner: Quad = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 400 }, { x: 100, y: 400 }];
  const whole = widenToWholeCard(inner);
  assert.ok(whole[2].y - 400 > 100 - whole[0].y);
  assert.ok(whole[0].x < 100 && whole[1].x > 300);
});

// A turned card: widening follows the card's own directions, not the picture's
test('a card lying on its side is widened along its own sides', () => {
  // The card's top edge runs DOWN the picture's right side here (top-left corner at the top right)
  const inner: Quad = [{ x: 400, y: 100 }, { x: 400, y: 300 }, { x: 100, y: 300 }, { x: 100, y: 100 }];
  const whole = widenToWholeCard(inner);
  // The card's bottom is towards the picture's left, so the left side moves out the most
  assert.ok(100 - whole[3].x > whole[0].x - 400);
});

const signs = (name: 'real' | 'partly' | 'no', printingExists = false, setIsReal = false, numberWasRead = false) => ({ name, printingExists, setIsReal, numberWasRead });

test('a real name or a real printing means the card is found; both is the full score', () => {
  assert.ok(readingScore(signs('real')) >= FOUND_SCORE);
  assert.ok(readingScore(signs('no', true, true, true)) >= FOUND_SCORE);
  assert.ok(readingScore(signs('real', false, false, true)) < FULL_SCORE);
  assert.ok(readingScore(signs('real', true, true, true)) >= FULL_SCORE);
});

test('a number or a set code alone is worth nothing (junk text has those by chance), but they add to a name', () => {
  assert.equal(readingScore(signs('no')), 0);
  assert.equal(readingScore(signs('no', false, true, true)), 0);
  assert.ok(readingScore(signs('real', false, false, true)) > readingScore(signs('real')));
  assert.ok(readingScore(signs('partly', false, true)) > readingScore(signs('partly')));
});

test('a name matched only partly counts, but less than a real one, and is not enough to stop looking', () => {
  assert.ok(readingScore(signs('partly')) > 0);
  assert.ok(readingScore(signs('partly')) < readingScore(signs('real')));
  assert.ok(readingScore(signs('partly', false, true)) < FOUND_SCORE);
});
