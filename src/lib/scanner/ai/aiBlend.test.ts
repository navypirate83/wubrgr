/* =====================================================================
   CHECKS FOR THE AI CLUE FROM SEVERAL LOOKS
   Run with:  node --test src/lib/scanner/ai/aiBlend.test.ts
   Same pretend model as aiClue.test.ts: a bright picture "points along number 0" (the artwork
   "bright"), a dark one "points along number 1" (the artwork "dark").
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiIndex } from './aiIndex.ts';
import { aiScoresFor } from './aiClue.ts';
import { blendedScores } from './aiBlend.ts';
import { KEPT_WIDTH } from '../core/artEmbed.ts';
import { simpleRecipe, pointing } from './aiTestKit.ts';

// A flat grey picture, 63 x 88: completely blurry (no detail at all)
const flat = (level: number) => ({ data: new Uint8ClampedArray(63 * 88 * 4).fill(level), width: 63, height: 88 });
// A bright picture full of fine detail (alternating 240 and 255): sharp, and still "bright" to the pretend model
function sharpBright() {
  const data = new Uint8ClampedArray(63 * 88 * 4);
  for (let i = 0; i < 63 * 88; i++) data.set([i % 2 ? 240 : 255, i % 2 ? 240 : 255, i % 2 ? 240 : 255, 255], i * 4);
  return { data, width: 63, height: 88 };
}

const printings = [{ id: 'p-bright', illus: 'bright', frame: '2015' }, { id: 'p-dark', illus: 'dark', frame: '2015' }];

function tools() {
  const first = createAiIndex(new Uint8Array(KEPT_WIDTH * 2), 'bright\ndark\n', simpleRecipe());
  const vectors = new Int8Array(KEPT_WIDTH * 2);
  vectors.set(first.shrink(pointing(0)), 0);
  vectors.set(first.shrink(pointing(1)), KEPT_WIDTH);
  const index = createAiIndex(new Uint8Array(vectors.buffer), 'bright\ndark\n', simpleRecipe());
  const embed = async (tensor: Float32Array) => pointing(tensor[0] > 0 ? 0 : 1);
  return { index, embed };
}

test('two sharp earlier looks outvote a blurry look that points the wrong way', async () => {
  const t = tools();
  // The look the AI chose is a blurry dark picture: alone, it says "dark"
  const picture = flat(10);
  const photo = t.index.shrink(await t.embed(new Float32Array([-1])));
  assert.ok(t.index.similarityToIllustration(photo, 'dark')! > t.index.similarityToIllustration(photo, 'bright')!);
  const scores = await blendedScores({ photo, picture, turn: 0, box: '2015' }, [{ picture: sharpBright(), sharpness: 0.9 }, { picture: sharpBright(), sharpness: 0.9 }], printings, t);
  assert.ok(scores);
  assert.ok(scores!.get('p-bright')! > scores!.get('p-dark')!);
});

test('with no earlier looks there is nothing to blend', async () => {
  const t = tools();
  const photo = t.index.shrink(pointing(0));
  assert.equal(await blendedScores({ photo, picture: sharpBright(), turn: 0, box: '2015' }, [], printings, t), null);
});

test('aiScoresFor uses the blend when nothing is clearly strong, and ignores earlier looks when something is', async () => {
  const t = tools();
  const earlierLooks = [{ picture: sharpBright(), sharpness: 0.9 }, { picture: sharpBright(), sharpness: 0.9 }];
  // Nothing is stopped early here, so the blend is used: the dark blurry look is outvoted
  const blended = await aiScoresFor([flat(10)], printings, t, { stopAt: Infinity, window: Infinity, earlierLooks });
  assert.ok(blended!.get('p-bright')! > blended!.get('p-dark')!);
  // With the normal stopping rule, the dark look is clearly strong (1.0), so the earlier looks are not even run
  const alone = await aiScoresFor([flat(10)], printings, t, { earlierLooks });
  assert.ok(alone!.get('p-dark')! > alone!.get('p-bright')!);
});
