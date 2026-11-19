/* =====================================================================
   CHECKS FOR THE AI CLUE (with a pretend model)
   Run with:  node --test src/lib/scanner/ai/aiClue.test.ts
   The pretend model answers "points along number 0" for a bright picture and
   "points along number 1" for a dark one, so we know which picture should win.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiIndex } from './aiIndex.ts';
import { aiScoresFor } from './aiClue.ts';
import { KEPT_WIDTH } from '../core/artEmbed.ts';
import { simpleRecipe, pointing } from './aiTestKit.ts';

// A flat grey picture, 63 x 88 (small, to keep the test quick)
const grey = (level: number) => ({ data: new Uint8ClampedArray(63 * 88 * 4).fill(level), width: 63, height: 88 });

// Two artworks: "bright" points along number 0, "dark" along number 1
function tools() {
  const first = createAiIndex(new Uint8Array(KEPT_WIDTH * 2), 'bright\ndark\n', simpleRecipe());
  const vectors = new Int8Array(KEPT_WIDTH * 2);
  vectors.set(first.shrink(pointing(0)), 0);
  vectors.set(first.shrink(pointing(1)), KEPT_WIDTH);
  const index = createAiIndex(new Uint8Array(vectors.buffer), 'bright\ndark\n', simpleRecipe());
  let calls = 0;
  // The model's input is a long list of decimals; its first one is lower for a dark picture
  const embed = async (tensor: Float32Array) => { calls++; return pointing(tensor[0] > 0 ? 0 : 1); };
  return { index, embed, calls: () => calls };
}

test('the picture that fits is the one believed, and each printing is scored by its own artwork', async () => {
  const t = tools();
  const printings = [
    { id: 'p-bright', illus: 'bright', frame: '2015' },
    { id: 'p-dark', illus: 'dark', frame: '2015' },
    { id: 'p-none', illus: 'unknown-art', frame: '2015' },
  ];
  // A bright and a dark picture of the card: the bright one fits "bright" best and wins the pick
  const scores = await aiScoresFor([grey(250), grey(10)], printings, t);
  assert.ok(scores);
  assert.equal(scores!.get('p-bright'), 1);
  assert.equal(scores!.get('p-dark'), 0);
  assert.equal(scores!.has('p-none'), false);
});

test('each turn and box is run through the model once, and asking again for the same photo runs nothing more', async () => {
  const t = tools();
  const printings = [{ id: 'a', illus: 'bright', frame: '2015' }, { id: 'b', illus: 'dark', frame: '1993' }];
  const pictures = [grey(250), grey(10)];
  await aiScoresFor(pictures, printings, t);
  // 2 pictures x 2 turns x (2015 box, 1993 box, whole card) = 12
  assert.equal(t.calls(), 12);
  await aiScoresFor(pictures, printings, t);
  assert.equal(t.calls(), 12);
});

test('the back face artwork counts too, and nothing to go on gives null', async () => {
  const t = tools();
  const two = await aiScoresFor([grey(250)], [{ id: 'x', illus: 'dark', illusBack: 'bright', frame: '2015' }], t);
  assert.equal(two!.get('x'), 1);
  assert.equal(await aiScoresFor([grey(250)], [{ id: 'y', illus: 'nope', frame: '2015' }], t), null);
  assert.equal(await aiScoresFor([], [{ id: 'y', illus: 'dark', frame: '2015' }], t), null);
});
