/* =====================================================================
   CHECKS FOR THE LIVE-FRAME SUMS AND SAFETY RULES
   Run with:  node --test src/lib/scanner/core/liveFrames.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_TARGET, MAX_FAILS, MAX_UNSURE, MIN_CAP_PX, NEW_TRUST, INFO_CAP_MM, PHOTO_TARGET, TITLE_CAP_MM,
  bigEnoughFor, capHeightPx, extraTurnForConverter, framesReady, judgeFrameTurn, needsCheck, sameShape,
  totalTurn, trustAfterCheck, trustAfterGrab,
} from './liveFrames.ts';
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH } from './frameChange.ts';

// A made-up signature with a clear pattern (a bright blob in one corner, like a card's art)
function blob(): number[] {
  const out: number[] = [];
  for (let y = 0; y < SIGNATURE_HEIGHT; y++) for (let x = 0; x < SIGNATURE_WIDTH; x++) out.push(x < 6 && y < 8 ? 220 : 60 + x * 2 + y);
  return out;
}

test('capital-letter height follows the picture width and the card share', () => {
  // 63 mm of card across 630 pixels = 10 pixels per millimetre
  assert.equal(capHeightPx(630, 1, 1.6), 16);
  assert.ok(Math.abs(capHeightPx(1260, 0.5, 2) - 20) < 1e-9);
});

test('the still photo target keeps small print well above the reading floor', () => {
  // The card is about 74% of the photo's width
  assert.ok(capHeightPx(PHOTO_TARGET.width, 0.74, INFO_CAP_MM) >= 2 * MIN_CAP_PX);
  // And the target is 3:4 (upright), the same shape as the frame target
  assert.ok(sameShape({ w: PHOTO_TARGET.width, h: PHOTO_TARGET.height }, { w: FRAME_TARGET.width, h: FRAME_TARGET.height }));
});

test('a 1080-wide frame reads the small print, a 720-wide one does not', () => {
  assert.equal(bigEnoughFor(1080, 0.74, INFO_CAP_MM), true);
  assert.equal(bigEnoughFor(720, 0.74, INFO_CAP_MM), false);
  // The big title letters are fine even in a small frame
  assert.equal(bigEnoughFor(720, 0.74, TITLE_CAP_MM), true);
});

test('shapes: same 3:4 matches, sideways and different shapes do not', () => {
  assert.equal(sameShape({ w: 1080, h: 1440 }, { w: 1944, h: 2592 }), true);
  assert.equal(sameShape({ w: 1440, h: 1080 }, { w: 1944, h: 2592 }), false);
  assert.equal(sameShape({ w: 1080, h: 1920 }, { w: 1944, h: 2592 }), false);
  assert.equal(sameShape({ w: 0, h: 10 }, { w: 1944, h: 2592 }), false);
});

test('the library turning mix-up: left and right need a half turn more, up and down none', () => {
  assert.equal(extraTurnForConverter('left'), 180);
  assert.equal(extraTurnForConverter('right'), 180);
  assert.equal(extraTurnForConverter('up'), 0);
  assert.equal(extraTurnForConverter('down'), 0);
});

test('the total turn adds the photo check\'s verdict, in half turns', () => {
  assert.equal(totalTurn('left', 0), 180);
  assert.equal(totalTurn('left', 180), 0);
  assert.equal(totalTurn('up', 0), 0);
  assert.equal(totalTurn('up', 180), 180);
});

test('a frame that matches the photo is upright; the same turned half a turn is upside down', () => {
  const photo = blob();
  assert.equal(judgeFrameTurn(photo, photo), 'upright');
  assert.equal(judgeFrameTurn([...photo].reverse(), photo), 'upside-down');
});

test('a flat scene, missing signatures or sizes that differ give "unsure"', () => {
  const flat = new Array(SIGNATURE_WIDTH * SIGNATURE_HEIGHT).fill(128);
  assert.equal(judgeFrameTurn(flat, flat), 'unsure');
  assert.equal(judgeFrameTurn(null, blob()), 'unsure');
  assert.equal(judgeFrameTurn(blob(), null), 'unsure');
  assert.equal(judgeFrameTurn([1, 2, 3], blob()), 'unsure');
});

test('a symmetric scene (same either way up) is "unsure", not a wrong guess', () => {
  const sym: number[] = [];
  for (let y = 0; y < SIGNATURE_HEIGHT; y++) for (let x = 0; x < SIGNATURE_WIDTH; x++) sym.push(Math.abs(x - 7.5) * 20 + Math.abs(y - 10.5) * 6);
  assert.equal(judgeFrameTurn(sym, sym), 'unsure');
});

test('a very different scene is "unsure"', () => {
  const a = blob();
  const b = a.map((_, i) => ((i * 37) % 251));
  assert.equal(judgeFrameTurn(b, a), 'unsure');
});

test('trust: failures in a row give up, a success clears the run', () => {
  let trust = { ...NEW_TRUST, checkedExtra: 0 as const };
  assert.equal(framesReady(trust), true);
  trust = trustAfterGrab(trust, false);
  trust = trustAfterGrab(trust, false);
  assert.equal(trust.off, false);
  trust = trustAfterGrab(trust, true);
  assert.equal(trust.fails, 0);
  for (let i = 0; i < MAX_FAILS; i++) trust = trustAfterGrab(trust, false);
  assert.equal(trust.off, true);
  assert.equal(framesReady(trust), false);
  assert.equal(needsCheck(trust), false);
});

test('trust: frames are not used until a check has settled the way up; unsure checks give up at the limit', () => {
  let trust = NEW_TRUST;
  assert.equal(framesReady(trust), false);
  assert.equal(needsCheck(trust), true);
  trust = trustAfterCheck(trust, 'unsure');
  assert.equal(needsCheck(trust), true);
  trust = trustAfterCheck(trust, 'upside-down');
  assert.equal(trust.checkedExtra, 180);
  assert.equal(framesReady(trust), true);
  let stuck = NEW_TRUST;
  for (let i = 0; i < MAX_UNSURE; i++) stuck = trustAfterCheck(stuck, 'unsure');
  assert.equal(stuck.off, true);
});
