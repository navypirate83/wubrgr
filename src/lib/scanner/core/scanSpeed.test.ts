/* =====================================================================
   CHECKS FOR THE SCAN-SPEED HELPERS
   Run with:  node --test src/lib/scanner/core/scanSpeed.test.ts
   Covers: the "has the picture changed?" signatures (frameChange.ts), results kept
   in scan order (resolveQueue.ts), time slicing (timeSlice.ts) and the warm-up
   runner (warmPlan.ts).
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH, changedFrame, sameFrame, signatureDifference, tinyFromGray, tinyFromRgba } from './frameChange.ts';
import { createOrderedResults } from './resolveQueue.ts';
import { makeBreather } from './timeSlice.ts';
import { runWarmSteps } from './warmPlan.ts';

/* ---------- frameChange ---------- */

// A made-up grey "card": a seeded pattern of blocks, so two different seeds are two different cards
function fakeCard(seed: number, width = 160, height = 220): Uint8Array {
  const out = new Uint8Array(width * height);
  let state = seed * 9301 + 49297;
  const blocks = new Map<string, number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${Math.floor(x / 10)},${Math.floor(y / 10)}`;
      if (!blocks.has(key)) { state = (state * 9301 + 49297) % 233280; blocks.set(key, Math.floor((state / 233280) * 255)); }
      out[y * width + x] = blocks.get(key)!;
    }
  }
  return out;
}
const withNoise = (gray: Uint8Array, amount: number): Uint8Array => gray.map((v, i) => Math.max(0, Math.min(255, v + (((i * 7919) % (2 * amount + 1)) - amount))));
const brighter = (gray: Uint8Array, by: number): Uint8Array => gray.map((v) => Math.min(255, v + by));

test('a signature has the same size whatever the picture size', () => {
  assert.equal(tinyFromGray(fakeCard(1), 160, 220).length, SIGNATURE_WIDTH * SIGNATURE_HEIGHT);
  assert.equal(tinyFromGray(fakeCard(1, 40, 55), 40, 55).length, SIGNATURE_WIDTH * SIGNATURE_HEIGHT);
});

test('the same card with a little camera noise counts as the same scene', () => {
  const a = tinyFromGray(fakeCard(1), 160, 220);
  const b = tinyFromGray(withNoise(fakeCard(1), 4), 160, 220);
  assert.ok(signatureDifference(a, b) < 0.03, `difference ${signatureDifference(a, b)}`);
  assert.equal(sameFrame(a, b), true);
  assert.equal(changedFrame(a, b), false);
});

test('the camera making the whole picture a little brighter does not count as a change', () => {
  const a = tinyFromGray(fakeCard(1), 160, 220);
  const b = tinyFromGray(brighter(fakeCard(1), 6), 160, 220);
  assert.equal(sameFrame(a, b), true);
});

test('a different card is a clear change', () => {
  const a = tinyFromGray(fakeCard(1), 160, 220);
  const b = tinyFromGray(fakeCard(2), 160, 220);
  assert.equal(sameFrame(a, b), false);
  assert.equal(changedFrame(a, b), true);
});

test('an empty (flat) table is a clear change from a card, and the same as itself', () => {
  const table = tinyFromGray(new Uint8Array(160 * 220).fill(90), 160, 220);
  const card = tinyFromGray(fakeCard(3), 160, 220);
  assert.equal(sameFrame(table, table), true);
  assert.equal(changedFrame(table, card), true);
});

test('a missing or different-sized signature is never "the same"', () => {
  const a = tinyFromGray(fakeCard(1), 160, 220);
  assert.equal(sameFrame(a, null), false);
  assert.equal(sameFrame(undefined, a), false);
  assert.equal(signatureDifference(a, new Uint8Array(10)), 1);
  assert.equal(signatureDifference(new Uint8Array(0), new Uint8Array(0)), 1);
});

test('colour pictures are squeezed the same way as grey ones, and a box can pick part of the picture', () => {
  const gray = fakeCard(5, 80, 110);
  const rgba = new Uint8Array(80 * 110 * 4);
  gray.forEach((v, i) => { rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; });
  const fromGray = tinyFromGray(gray, 80, 110);
  const fromRgba = tinyFromRgba(rgba, 80, 110);
  assert.ok(signatureDifference(fromGray, fromRgba) < 0.01);
  // only the left half of the picture is a different thing from the whole
  assert.notDeepEqual(tinyFromGray(gray, 80, 110, [0, 0, 0.5, 1]), fromGray);
});

/* ---------- resolveQueue ---------- */

test('answers are used in ticket order even when they arrive out of order', () => {
  const queue = createOrderedResults();
  const used: string[] = [];
  const [a, b, c] = [queue.ticket(), queue.ticket(), queue.ticket()];
  assert.equal(queue.waiting(), 3);
  queue.finish(c, () => used.push('c'));
  queue.finish(a, () => used.push('a'));
  assert.deepEqual(used, ['a']);          // b is still missing, so c waits
  queue.finish(b, () => used.push('b'));
  assert.deepEqual(used, ['a', 'b', 'c']);
  assert.equal(queue.waiting(), 0);
});

test('a skipped ticket does not hold the others up, and nothing is used twice', () => {
  const queue = createOrderedResults();
  const used: string[] = [];
  const [a, b, c] = [queue.ticket(), queue.ticket(), queue.ticket()];
  queue.finish(c, () => used.push('c'));
  queue.finish(b, () => used.push('b'));
  queue.skip(a);
  assert.deepEqual(used, ['b', 'c']);
  queue.skip(a);   // a second skip of the same ticket changes nothing
  assert.deepEqual(used, ['b', 'c']);
});

test('one answer that throws does not stop the ones behind it', () => {
  const queue = createOrderedResults();
  const used: string[] = [];
  const [a, b] = [queue.ticket(), queue.ticket()];
  queue.finish(b, () => used.push('b'));
  queue.finish(a, () => { throw new Error('boom'); });
  assert.deepEqual(used, ['b']);
});

test('after the hold limit, later answers go ahead, and the late one is still used when it arrives', () => {
  // a pretend timer we fire by hand
  let fire: (() => void) | null = null;
  const queue = createOrderedResults(1000, (fn) => { fire = fn; return 1; }, () => { fire = null; });
  const used: string[] = [];
  const [a, b] = [queue.ticket(), queue.ticket()];
  queue.finish(b, () => used.push('b'));
  assert.deepEqual(used, []);
  assert.ok(fire, 'a time limit was started');
  fire!();
  assert.deepEqual(used, ['b']);
  queue.finish(a, () => used.push('a'));
  assert.deepEqual(used, ['b', 'a']);
});

/* ---------- timeSlice ---------- */

test('the breather only pauses after a slice of work has been used up', async () => {
  let clock = 0;
  let pauses = 0;
  const breathe = makeBreather(10, () => clock, async () => { pauses++; });
  await breathe(); clock = 5; await breathe();
  assert.equal(pauses, 0);
  clock = 12; await breathe();
  assert.equal(pauses, 1);
  clock = 15; await breathe();   // a fresh slice began at the pause
  assert.equal(pauses, 1);
});

/* ---------- warmPlan ---------- */

test('warm-up runs every step in order and writes down how long each took', async () => {
  const ran: string[] = [];
  let clock = 0;
  const steps = ['a', 'b', 'c'].map((name) => ({ name, run: async () => { ran.push(name); clock += 10; } }));
  const result = await runWarmSteps(steps, () => false, async () => {}, () => clock);
  assert.deepEqual(ran, ['a', 'b', 'c']);
  assert.deepEqual(result.timings, { a: 10, b: 10, c: 10 });
  assert.deepEqual(result.failed, []);
  assert.equal(result.cancelled, false);
});

test('a failing step is noted and never stops the next ones or throws', async () => {
  const ran: string[] = [];
  const steps = [
    { name: 'a', run: async () => { throw new Error('no'); } },
    { name: 'b', run: async () => { ran.push('b'); } },
  ];
  const result = await runWarmSteps(steps, () => false, async () => { throw new Error('pause broke'); });
  assert.deepEqual(result.failed, ['a']);
  assert.deepEqual(ran, ['b']);
});

test('cancelling stops the steps that have not started', async () => {
  const ran: string[] = [];
  let cancelled = false;
  const steps = [
    { name: 'a', run: async () => { ran.push('a'); cancelled = true; } },
    { name: 'b', run: async () => { ran.push('b'); } },
  ];
  const result = await runWarmSteps(steps, () => cancelled, async () => {});
  assert.deepEqual(ran, ['a']);
  assert.equal(result.cancelled, true);
});
