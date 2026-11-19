/* =====================================================================
   CHECKS FOR THE SAVED-ART-FINGERPRINT INDEX AND THE AI CLUE
   Run with:  node --test src/lib/scanner/ai/aiIndex.test.ts src/lib/scanner/ai/aiClue.test.ts
   These use small made-up fingerprints and a pretend model, so they need
   no downloads. (aiReal.test.ts uses the real files when they are there.)
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_WIDTH, KEPT_WIDTH } from '../core/artEmbed.ts';
import { createAiIndex } from './aiIndex.ts';
import { pointing, simpleRecipe } from './aiTestKit.ts';

// Three artworks "a", "b" and "c", pointing along numbers 0, 1 and 2
function threeArtworks() {
  const index0 = createAiIndex(new Uint8Array(KEPT_WIDTH * 3), 'a\nb\nc\n', simpleRecipe());
  const vectors = new Int8Array(KEPT_WIDTH * 3);
  [0, 1, 2].forEach((k) => vectors.set(index0.shrink(pointing(k)), k * KEPT_WIDTH));
  return createAiIndex(new Uint8Array(vectors.buffer), 'a\nb\nc\n', simpleRecipe());
}

test('a photo alike one artwork is closest to it, and unrelated to the others', () => {
  const index = threeArtworks();
  assert.equal(index.rows, 3);
  const photo = index.shrink(pointing(1));
  assert.equal(index.similarityToIllustration(photo, 'b'), 1);
  assert.equal(index.similarityToIllustration(photo, 'a'), 0);
  // the model's 768 numbers can be handed over directly as well
  assert.equal(index.similarityToIllustration(pointing(2), 'c'), 1);
});

test('an artwork with no saved fingerprint answers null', () => {
  assert.equal(threeArtworks().similarityToIllustration(pointing(0), 'zzz'), null);
});

test('nearestArt lists the closest artworks best first', () => {
  const index = threeArtworks();
  // halfway between "a" and "c", a little nearer "c"
  const mixed = new Float32Array(FULL_WIDTH);
  mixed[0] = 0.6;
  mixed[2] = 0.8;
  const near = index.nearestArt(mixed, 2);
  assert.deepEqual(near.map((n) => n.illustrationId), ['c', 'a']);
  assert.ok(near[0].similarity > near[1].similarity);
});

test('files that do not match each other are refused', () => {
  assert.throws(() => createAiIndex(new Uint8Array(KEPT_WIDTH * 2), 'a\nb\nc\n', simpleRecipe()), /do not match/);
  assert.throws(() => createAiIndex(new Uint8Array(KEPT_WIDTH), 'a\n', new Uint8Array(100)), /wrong size/);
});

test('a recipe that does not start on a multiple of 4 bytes still works', () => {
  // The recipe bytes placed one byte into a bigger buffer, like a file read from storage might be
  const recipe = simpleRecipe();
  const shifted = new Uint8Array(recipe.length + 1);
  shifted.set(recipe, 1);
  const index = createAiIndex(new Uint8Array(KEPT_WIDTH), 'a\n', shifted.subarray(1));
  assert.equal(index.shrink(pointing(5))[5], 127);
});
