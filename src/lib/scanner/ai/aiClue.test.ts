/* =====================================================================
   CHECKS FOR THE AI CLUE (with a pretend model)
   Run with:  node --test src/lib/scanner/ai/aiClue.test.ts
   The pretend model answers "points along number 0" for a bright picture and
   "points along number 1" for a dark one, so we know which picture should win.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiIndex } from './aiIndex.ts';
import { SECOND_LOOK_WINDOW, STRONG_MATCH, aiScoresFor, boxOrder, pictureOrder } from './aiClue.ts';
import { ART_BOXES, artTensor, standardCard } from '../core/modelInput.ts';
import { eraOf } from '../core/scannerTypes.ts';
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
  // (stopping early is switched off here so that every combination is tried)
  const everything = { stopAt: Infinity, window: Infinity };
  await aiScoresFor(pictures, printings, t, everything);
  // 2 pictures x 2 turns x (2015 box, 1993 box, whole card) = 12
  assert.equal(t.calls(), 12);
  await aiScoresFor(pictures, printings, t, everything);
  assert.equal(t.calls(), 12);
});

test('the back face artwork counts too, and nothing to go on gives null', async () => {
  const t = tools();
  const two = await aiScoresFor([grey(250)], [{ id: 'x', illus: 'dark', illusBack: 'bright', frame: '2015' }], t);
  assert.equal(two!.get('x'), 1);
  assert.equal(await aiScoresFor([grey(250)], [{ id: 'y', illus: 'nope', frame: '2015' }], t), null);
  assert.equal(await aiScoresFor([], [{ id: 'y', illus: 'dark', frame: '2015' }], t), null);
});

/* ----- fewer model runs ----- */

// A model answer that leans partly toward "dark": a weak match for "bright" (the more "lean", the weaker)
const leaning = (lean: number) => { const v = pointing(0); v[1] = lean; return v; };

// The old way (kept here only to compare against): every picture x turn x box, the closest one believed
async function everyCombination(pictures: ReturnType<typeof grey>[], printings: { id: string; illus?: string | null; frame: string }[], t: ReturnType<typeof tools>) {
  const boxes = [...new Set([...printings.map((p) => eraOf(p.frame)), 'full'])];
  let best: { score: number; scores: Map<string, number> } | null = null;
  for (const picture of pictures) for (const turn of [0, 180] as const) for (const box of boxes) {
    const photo = t.index.shrink(await t.embed(artTensor(standardCard(picture, turn), ART_BOXES[box])));
    const scores = new Map<string, number>();
    let top = -Infinity;
    for (const p of printings) {
      const value = p.illus ? t.index.similarityToIllustration(photo, p.illus) : null;
      if (value === null) continue;
      scores.set(p.id, value);
      top = Math.max(top, value);
    }
    if (scores.size > 0 && (!best || top > best.score)) best = { score: top, scores };
  }
  return best ? best.scores : null;
}

test('with nothing "strong" to stop at, the answer is exactly the old try-everything answer', async () => {
  const printings = [{ id: 'a', illus: 'bright', frame: '2015' }, { id: 'b', illus: 'dark', frame: '1993' }, { id: 'c', illus: 'bright', frame: '1997' }];
  const pictures = [grey(250), grey(10), grey(120)];
  const old = await everyCombination(pictures, printings, tools());
  const now = await aiScoresFor([...pictures], printings, tools(), { stopAt: Infinity, window: Infinity });
  assert.deepEqual([...now!.entries()].sort(), [...old!.entries()].sort());
});

test('a strong match on the first look stops the search: one model run instead of twelve', async () => {
  const t = tools();
  const printings = [{ id: 'a', illus: 'bright', frame: '2015' }, { id: 'b', illus: 'dark', frame: '1993' }];
  // The first picture is the bright one, which matches "bright" perfectly (1.0, over the strong bar)
  const scores = await aiScoresFor([grey(250), grey(10)], printings, t);
  assert.equal(t.calls(), 1);
  assert.equal(scores!.get('a'), 1);
  assert.ok(1 >= STRONG_MATCH);
});

test('pictures are tried in order: the first, then the camera\'s crop (the last), then the others', () => {
  assert.deepEqual(pictureOrder(1), [0]);
  assert.deepEqual(pictureOrder(2), [0, 1]);
  assert.deepEqual(pictureOrder(3), [0, 2, 1]);
  assert.deepEqual(pictureOrder(4), [0, 3, 1, 2]);
});

test('boxes are tried most common era first, the whole card last', () => {
  const printing = (frame: string) => ({ id: frame, illus: 'x', frame });
  assert.deepEqual(boxOrder([printing('1993'), printing('2015'), printing('2015'), printing('2015'), printing('1997'), printing('1997')]), ['2015', '1997', '1993', 'full']);
  // one era: just that box and the whole card
  assert.deepEqual(boxOrder([printing('2015')]), ['2015', 'full']);
});

test('when the first looks are weak, the picture and turn that looked best get the other boxes first', async () => {
  const printings = [{ id: 'a', illus: 'bright', frame: '2015' }];
  const first = createAiIndex(new Uint8Array(KEPT_WIDTH * 2), 'bright\ndark\n', simpleRecipe());
  const vectors = new Int8Array(KEPT_WIDTH * 2);
  vectors.set(first.shrink(pointing(0)), 0);
  vectors.set(first.shrink(pointing(1)), KEPT_WIDTH);
  const index = createAiIndex(new Uint8Array(vectors.buffer), 'bright\ndark\n', simpleRecipe());
  // The answers in the order they are asked for: weak (turn 0), a bit better (turn 180), then strong (turn 180's other box)
  const answers = [leaning(3), leaning(2), pointing(0)];
  let run = 0;
  const tries: string[] = [];
  const scores = await aiScoresFor([grey(250)], printings, { embed: async () => answers[run++], index }, { onTry: (t) => tries.push(`${t.turn}/${t.box}`) });
  assert.equal(run, 3);
  assert.deepEqual(tries, ['0/2015', '180/2015', '180/full']);
  assert.equal(scores!.get('a'), 1);
});

test('a picture and turn whose first look was far behind never get their other boxes tried (the window)', async () => {
  const printings = [{ id: 'a', illus: 'bright', frame: '2015' }];
  // Two flat grey pictures: the bright one matches (turning a flat grey picture changes nothing, so both turns score 1),
  // the dark one scores 0. Nothing is "strong" (the bar is out of reach), so only the window decides what else is run.
  const narrow = tools();
  await aiScoresFor([grey(250), grey(10)], printings, narrow, { stopAt: 2, window: SECOND_LOOK_WINDOW });
  // First look: 2 pictures x 2 turns = 4 runs; then only the bright picture's two turns get the whole-card box: 6 in all
  assert.equal(narrow.calls(), 6);
  const wide = tools();
  await aiScoresFor([grey(250), grey(10)], printings, wide, { stopAt: 2, window: Infinity });
  assert.equal(wide.calls(), 8);
});

test('a better combination found later still wins when nothing is strong (nothing is lost)', async () => {
  const printings = [{ id: 'a', illus: 'bright', frame: '2015' }];
  // The dark picture comes first and is a poor match; the bright one comes later and is a perfect match.
  // With no stop (the bar is out of reach) both are looked at and the better one is believed.
  const scores = await aiScoresFor([grey(10), grey(250)], printings, tools(), { stopAt: 2 });
  assert.equal(scores!.get('a'), 1);
});

test('the bars chosen from the real photos are sane', () => {
  assert.ok(STRONG_MATCH > 0.5 && STRONG_MATCH < 1);
  assert.ok(SECOND_LOOK_WINDOW > 0 && SECOND_LOOK_WINDOW < 0.5);
});
