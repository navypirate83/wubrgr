/* =====================================================================
   CHECKS FOR "WHERE IS THE CARD IN THE PHOTO"
   Run with:  node --test src/lib/scanner/core/cardInPhoto.test.ts
   Each check uses a pretend screen and photo with sizes chosen so the right
   answer can be worked out by hand.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cardInPickedPhoto, clampBox, guideInPhoto } from './cardInPhoto.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test('a photo with the same shape as the screen: the guide maps straight across', () => {
  // A 100 x 200 screen showing a 1000 x 2000 photo: every screen pixel is 10 photo pixels
  const box = guideInPhoto({ w: 100, h: 200 }, { x: 10, y: 20, w: 50, h: 100 }, { w: 1000, h: 2000 });
  [0.1, 0.1, 0.5, 0.5].forEach((want, i) => near(box[i], want));
});

test('a photo wider than the screen: the sides are cut off, so the guide is a bit more central', () => {
  // A 100 x 200 screen showing a 400 x 400 photo: scaled by 0.5 to fill the height (200 x 200),
  // so 50 pixels of the photo's width hang off each side of the screen
  const box = guideInPhoto({ w: 100, h: 200 }, { x: 0, y: 0, w: 100, h: 200 }, { w: 400, h: 400 });
  // The whole screen shows the middle half of the photo's width, and all of its height
  near(box[0], 0.25);
  near(box[1], 0);
  near(box[2], 0.5);
  near(box[3], 1);
});

test('a guide hanging off the photo is kept inside it', () => {
  const box = clampBox([-0.1, 0.9, 0.5, 0.5]);
  near(box[0], 0);
  near(box[1], 0.9);
  near(box[2], 0.4);
  near(box[3], 0.1);
});

test('a picked photo that is card-shaped is used whole', () => {
  assert.deepEqual(cardInPickedPhoto({ w: 630, h: 880 }, 63 / 88), [0, 0, 1, 1]);
});

test('a picked wide photo uses a card-shaped box in the middle', () => {
  // 2000 x 1000: the card is as tall as the photo (1000), so 1000 * 63/88 wide, centred
  const box = cardInPickedPhoto({ w: 2000, h: 1000 }, 63 / 88);
  near(box[1], 0);
  near(box[3], 1);
  near(box[2] * 2000, (1000 * 63) / 88);
  near(box[0] + box[2] / 2, 0.5);
});
