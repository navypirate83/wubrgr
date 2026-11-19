/* =====================================================================
   CHECKS FOR THE OUTLINE CARD FINDER (outlineFinder.ts)
   Run with:  node --test src/lib/scanner/core/outlineFinder.test.ts
   Two kinds of check:
   1. A made-up picture of a tilted card on a busy "table", so we know
      exactly where the card is.
   2. The 32 real phone photos from the experiment (scripts/catalogue/cache).
      The experiment's own finder (in real-photos-test.mjs) wrote down where it
      found the card in each photo (real-photos-results.json), and cut-out
      pictures (real-photos-crops). The app's version must find the same
      card, and its straightened picture must look like the saved cut-out.
      The "sharp" picture library from scripts/catalogue/node_modules is used
      ONLY here to open the photos (never in the app). These checks are
      skipped on a computer without those files.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { findOutlines, flatCard } from './outlineFinder.ts';

// Where the experiment files live
const CATALOGUE = fileURLToPath(new URL('../../../../scripts/catalogue/', import.meta.url));
const PHOTOS = join(CATALOGUE, 'cache', 'real-photos');
const CROPS = join(CATALOGUE, 'cache', 'real-photos-crops');
const RESULTS = join(CATALOGUE, 'cache', 'real-photos-results.json');

// The picture library, if this computer has it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any = null;
try {
  sharp = createRequire(join(CATALOGUE, 'package.json'))('sharp');
} catch {
  sharp = null;
}
const skipReal = sharp !== null && existsSync(RESULTS) && existsSync(PHOTOS) ? false : 'the experiment photos are not on this computer';

// ---------------------------------------------------------------------
// 1. A MADE-UP PICTURE
// ---------------------------------------------------------------------
// Repeatable "random" numbers, so a failing check fails the same way each time
function randoms(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('finds a tilted card on a noisy background', () => {
  const width = 360, height = 270;
  const random = randoms(5);
  const data = new Uint8ClampedArray(width * height * 4);
  // The card: centre (190,130), long side 150 pixels (so 107 across), long side tilted 20 degrees from "down"
  const cx = 190, cy = 130, L = 150, W = L * 0.716, tilt = (110 * Math.PI) / 180;
  const ux = Math.cos(tilt), uy = Math.sin(tilt);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = (x - cx) * ux + (y - cy) * uy;
      const across = -(x - cx) * uy + (y - cy) * ux;
      const onCard = Math.abs(along) < L / 2 && Math.abs(across) < W / 2;
      // The table is mid-grey with noise; the card is light with a darker frame inside and noise
      let v = 90 + random() * 40;
      if (onCard) v = Math.abs(along) < L / 2 - 12 && Math.abs(across) < W / 2 - 12 ? 150 + random() * 30 : 235 - random() * 10;
      const at = (y * width + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = v;
      data[at + 3] = 255;
    }
  }
  const found = findOutlines({ data, width, height });
  assert.ok(found.length >= 1);
  const best = found[0];
  assert.ok(Math.hypot(best.centre.x - cx, best.centre.y - cy) < 4, `centre ${best.centre.x},${best.centre.y}`);
  // The long side may be found as the full card or the card without its frame; the full card has the biggest edge
  assert.ok(Math.abs(best.length - L) < L * 0.08, `long side ${best.length}`);
  // The angle is only known up to a half turn
  const diff = Math.abs((((best.angle - tilt) * 180) / Math.PI) % 180);
  assert.ok(Math.min(diff, 180 - diff) < 3, `tilt off by ${diff} degrees`);
  // The straightened picture is 630 x 880 and the frame sits at its edge (light) with the inside darker
  const flat = flatCard({ data, width, height }, best);
  assert.equal(flat.width, 630);
  assert.equal(flat.height, 880);
  assert.equal(flat.data.length, 630 * 880 * 4);
  const mid = (440 * 630 + 315) * 4;
  assert.ok(flat.data[mid] < 200, 'the inside of the card is the darker part');
  const edge = (440 * 630 + 15) * 4;
  assert.ok(flat.data[edge] > 215, 'the frame is the light part');
});

test('a plain grey picture or a tiny one gives no crash', () => {
  assert.deepEqual(findOutlines({ data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 }), []);
  const flatGrey = findOutlines({ data: new Uint8Array(100 * 80).fill(120), width: 100, height: 80, channels: 1 });
  // Nothing to find, but it must not fail; any candidate it names must still have a score
  for (const c of flatGrey) assert.ok(Number.isFinite(c.score));
});

// ---------------------------------------------------------------------
// 2. THE REAL PHOTOS
// ---------------------------------------------------------------------
// What the test script wrote down for each photo: its candidates as length, short side, centre and tilt.
type Recorded = { n: string; file: string; boxes: { length: number; x: number; y: number; tilt: number; score: number }[] };
function recorded(): Recorded[] {
  const rows = JSON.parse(readFileSync(RESULTS, 'utf8')) as { photo: { n: string; file: string }; outline: string }[];
  return rows.map((r) => ({
    n: r.photo.n,
    file: r.photo.file,
    boxes: r.outline.split(' || ').map((text) => {
      const m = text.match(/outline (\d+)x(\d+) px at (-?\d+),(-?\d+), tilt (-?\d+) deg, edge score ([\d.]+)/);
      if (!m) throw new Error(`cannot read "${text}"`);
      return { length: +m[1], x: +m[3], y: +m[4], tilt: +m[5], score: +m[6] };
    }),
  }));
}

// A photo as red-green-blue-alpha numbers, at its full size or shrunk so its long side is "side"
async function loadPhoto(file: string, side: number | null) {
  let image = sharp(join(PHOTOS, file)).removeAlpha().ensureAlpha();
  if (side) {
    const m = await sharp(join(PHOTOS, file)).metadata();
    const k = side / Math.max(m.width, m.height);
    image = image.resize(Math.round(m.width * k), Math.round(m.height * k));
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width as number, height: info.height as number };
}

// Is this candidate the same place as one the test script found? (long side within 4%, middle within
// 3% of the long side, turn within 4 degrees; a turn of 180 degrees looks the same to the finder)
function sameBox(c: { length: number; centre: { x: number; y: number }; angle: number }, r: { length: number; x: number; y: number; tilt: number }, scale = 1): boolean {
  const lengthOk = Math.abs(c.length / scale - r.length) < r.length * 0.04;
  const centreOk = Math.hypot(c.centre.x / scale - r.x, c.centre.y / scale - r.y) < r.length * 0.03;
  const turn = Math.abs((((c.angle * 180) / Math.PI - r.tilt) % 180 + 180) % 180);
  return lengthOk && centreOk && Math.min(turn, 180 - turn) < 4;
}

test('on the 32 real photos the app finder finds the same cards as the test script (full-size photos)', { skip: skipReal }, async () => {
  let firstMatches = 0, allMatches = 0, total = 0;
  const misses: string[] = [];
  const times: number[] = [];
  for (const r of recorded()) {
    const photo = await loadPhoto(r.file, null);
    const started = performance.now();
    const found = findOutlines(photo);
    times.push(performance.now() - started);
    total++;
    // Every box the script found should also be among the app's (and the other way round)
    const first = found.length > 0 && sameBox(found[0], r.boxes[0]);
    const all = r.boxes.every((b) => found.some((c) => sameBox(c, b))) && found.every((c) => r.boxes.some((b) => sameBox(c, b)));
    if (first) firstMatches++; else misses.push(r.n);
    if (all) allMatches++;
  }
  times.sort((a, b) => a - b);
  console.log(`  best card matches the script: ${firstMatches}/${total} (misses: ${misses.join(', ') || 'none'}); both candidates agree: ${allMatches}/${total}; full-size photos: median ${times[Math.floor(times.length / 2)].toFixed(0)} ms, slowest ${times[times.length - 1].toFixed(0)} ms`);
  assert.ok(firstMatches >= total - 3, `only ${firstMatches} of ${total} photos found the same best card`);
});

test('shrunk to about 1000 pixels (what a phone would hand over) it still finds the same cards, and how long it takes', { skip: skipReal }, async () => {
  let firstMatches = 0, total = 0;
  const times: number[] = [];
  for (const r of recorded()) {
    const photo = await loadPhoto(r.file, 1000);
    const full = await sharp(join(PHOTOS, r.file)).metadata();
    const scale = Math.max(photo.width, photo.height) / Math.max(full.width, full.height);
    const started = performance.now();
    const found = findOutlines(photo);
    times.push(performance.now() - started);
    total++;
    if (found.length > 0 && sameBox(found[0], r.boxes[0], scale)) firstMatches++;
  }
  times.sort((a, b) => a - b);
  console.log(`  1000 px photos: best card matches: ${firstMatches}/${total}; median ${times[Math.floor(times.length / 2)].toFixed(0)} ms, slowest ${times[times.length - 1].toFixed(0)} ms`);
  assert.ok(firstMatches >= total - 3);
});

test('the straightened card looks like the test script cut-out', { skip: skipReal }, async () => {
  const diffs: string[] = [];
  for (const n of ['02', '04', '09', '13', '22', '28', '31', '33']) {
    const r = recorded().find((x) => x.n === n)!;
    const photo = await loadPhoto(r.file, null);
    const found = findOutlines(photo);
    const flat = flatCard(photo, found[0]);
    const reference: Buffer = await sharp(join(CROPS, `${n}-card-outline.jpg`)).removeAlpha().raw().toBuffer();
    // Average difference in colour (0 to 255) between the two 630 x 880 pictures
    let sum = 0;
    for (let i = 0; i < 630 * 880; i++) for (let c = 0; c < 3; c++) sum += Math.abs(flat.data[i * 4 + c] - reference[i * 3 + c]);
    const mean = sum / (630 * 880 * 3);
    diffs.push(`${n}: ${mean.toFixed(1)}`);
    // Two different cards or a card upside down would differ by 40 or more; the same card a pixel or two apart by under 20
    assert.ok(mean < 20, `photo ${n}: average colour difference ${mean}`);
  }
  console.log(`  straightened card vs script cut-out, average colour difference (0-255): ${diffs.join(', ')}`);
});
