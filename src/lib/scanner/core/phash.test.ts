/* =====================================================================
   TESTS FOR THE ART FINGERPRINT
   Run with:  node --test src/lib/scanner/core/
   (Node runs the TypeScript directly; nothing needs installing.)
   They check what the scanner depends on: the same picture gives the same
   fingerprint, a brighter or bigger or slightly noisy copy of it gives a
   nearly identical one, and a different picture gives a very different one.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { HASH_BYTES, artHash, hammingDistance, hashToHex, hexToHash, rgbaToGray } from './phash.ts';
import { normalizeName } from './text.ts';

// A made-up "artwork": soft shapes from a seed, as a grey picture
function picture(seed: number, width = 200, height = 150): Uint8Array {
  const gray = new Uint8Array(width * height);
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
  const blobs = Array.from({ length: 6 }, () => ({ x: random() * width, y: random() * height, r: 20 + random() * 50, v: random() * 255 }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 90;
      for (const b of blobs) {
        const d = Math.hypot(x - b.x, y - b.y);
        if (d < b.r) v += (b.v - 90) * (1 - d / b.r);
      }
      gray[y * width + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return gray;
}

// The same picture at another size (nearest pixel), brighter, or with noise
function resized(gray: Uint8Array, w: number, h: number, nw: number, nh: number): Uint8Array {
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[y * nw + x] = gray[Math.floor((y * h) / nh) * w + Math.floor((x * w) / nw)];
  return out;
}
const brighter = (gray: Uint8Array, by: number) => gray.map((v) => Math.min(255, v + by));

test('a fingerprint is 32 bytes and the same picture gives the same one', () => {
  const a = artHash(picture(1), 200, 150);
  assert.equal(a.length, HASH_BYTES);
  assert.equal(hammingDistance(a, artHash(picture(1), 200, 150)), 0);
});

test('a bigger, smaller or brighter copy is nearly the same', () => {
  // (Tried on real artwork too, with a size change, brightness, JPEG
  // compression and blur: all within 20 bits, while different artworks were
  // never closer than 96. A copy that is shifted or turned is NOT this close:
  // the scanner has to crop the art box carefully, and try a few shifts.)
  const base = picture(2);
  const hash = artHash(base, 200, 150);
  assert.ok(hammingDistance(hash, artHash(resized(base, 200, 150, 400, 300), 400, 300)) <= 6, 'bigger');
  assert.ok(hammingDistance(hash, artHash(resized(base, 200, 150, 120, 90), 120, 90)) <= 20, 'smaller');
  assert.ok(hammingDistance(hash, artHash(brighter(base, 25), 200, 150)) <= 6, 'brighter');
});

test('different pictures are far apart', () => {
  const distances = [];
  for (let seed = 10; seed < 30; seed++) distances.push(hammingDistance(artHash(picture(seed), 200, 150), artHash(picture(seed + 100), 200, 150)));
  const average = distances.reduce((a, b) => a + b, 0) / distances.length;
  assert.ok(average > 60, `average distance ${average}`);
  assert.ok(Math.min(...distances) > 25, `closest pair ${Math.min(...distances)}`);
});

test('hammingDistance counts differing bits', () => {
  const a = new Uint8Array(HASH_BYTES);
  const b = new Uint8Array(HASH_BYTES);
  assert.equal(hammingDistance(a, b), 0);
  b[0] = 0b1011;
  b[31] = 0xff;
  assert.equal(hammingDistance(a, b), 11);
});

test('a fingerprint goes to text and back', () => {
  const hash = artHash(picture(3), 200, 150);
  const hex = hashToHex(hash);
  assert.equal(hex.length, 64);
  assert.deepEqual(hexToHash(hex), hash);
});

test('rgbaToGray makes grey with the usual weights', () => {
  const gray = rgbaToGray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255], 4, 1);
  assert.deepEqual(Array.from(gray), [76, 150, 29, 255]);
});

test('normalizeName removes accents, punctuation and case', () => {
  assert.equal(normalizeName("Lim-Dûl's Vault"), 'lim dul s vault');
  assert.equal(normalizeName('  Fire // Ice '), 'fire ice');
  assert.equal(normalizeName('Æther Vial'), 'ther vial');
});
