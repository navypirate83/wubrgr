/* =====================================================================
   CHECKS FOR THE AI PICTURE PREPARATION (modelInput.ts)
   Run with:  node --test src/lib/scanner/core/modelInput.test.ts
   Two kinds of check:
   1. Small made-up pictures, so we know the right answers (turning,
      the layout of the numbers, the fingerprint maths).
   2. A check against the experiment's own picture library (the "sharp"
      program in scripts/catalogue/node_modules, used ONLY here in the
      tests, never in the app): for real cut-out cards it makes the model
      numbers the way scripts/catalogue/embed/real-photos-test.mjs and
      lib.mjs do, and the app's pure-TypeScript version must give nearly
      the same numbers. If the AI model and its program are there, it also
      checks that the two give nearly the same fingerprint. Those checks
      are skipped on a computer without those files.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  ART_BOXES, ART_BOX_NAMES, CARD_HEIGHT, CARD_WIDTH, MODEL_MEAN, MODEL_SIZE, MODEL_STD, TURNS,
  allArtTensors, artTensor, pictureTensor, poolTokens, standardCard, turnPicture, type Picture, type Turn,
} from './modelInput.ts';

// Where the experiment files live
const CATALOGUE = fileURLToPath(new URL('../../../../scripts/catalogue/', import.meta.url));
const CROPS = join(CATALOGUE, 'cache', 'real-photos-crops');

// The picture library, if this computer has it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any = null;
try {
  sharp = createRequire(join(CATALOGUE, 'package.json'))('sharp');
} catch {
  sharp = null;
}
const haveCards = sharp !== null && existsSync(join(CROPS, '11-card-outline.jpg'));
const skipReal = haveCards ? false : 'the experiment files (sharp and the card cut-outs) are not on this computer';

// A small test picture: each pixel's colour is worked out from where it is
function made(width: number, height: number): Picture & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 7 + y * 3) % 256;
      data[i + 1] = (x * 2 + y * 11) % 256;
      data[i + 2] = (x * 5) % 256;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// The model constants must be the ones the model was trained with
test('the model constants are the ones DINOv2 was trained with', () => {
  assert.equal(MODEL_SIZE, 224);
  assert.deepEqual([...MODEL_MEAN], [0.485, 0.456, 0.406]);
  assert.deepEqual([...MODEL_STD], [0.229, 0.224, 0.225]);
});

// Turning: four quarter turns is a full circle, and a quarter turn swaps the sides
test('turning four quarter-turns gives the picture back, and a quarter turn swaps width and height', () => {
  const pic = made(5, 3);
  const quarter = turnPicture(pic, 90);
  assert.equal(quarter.width, 3);
  assert.equal(quarter.height, 5);
  // Clockwise: the top-left pixel ends up at the top-right
  assert.deepEqual([...quarter.data.slice(2 * 4, 2 * 4 + 3)], [...pic.data.slice(0, 3)]);
  let again: Picture = pic;
  for (let i = 0; i < 4; i++) again = turnPicture(again, 90);
  assert.deepEqual([...again.data as Uint8ClampedArray], [...pic.data]);
  assert.deepEqual([...turnPicture(turnPicture(pic, 90), 90).data], [...turnPicture(pic, 180).data]);
  assert.deepEqual([...turnPicture(turnPicture(pic, 180), 90).data], [...turnPicture(pic, 270).data]);
});

// A picture with no alpha number per pixel works too
test('a picture with 3 numbers per pixel is accepted like one with 4', () => {
  const four = made(6, 4);
  const three = new Uint8ClampedArray(6 * 4 * 3);
  for (let i = 0; i < 24; i++) for (let c = 0; c < 3; c++) three[i * 3 + c] = four.data[i * 4 + c];
  assert.deepEqual([...turnPicture({ data: three, width: 6, height: 4, channels: 3 }, 270).data], [...turnPicture(four, 270).data]);
});

// A flat grey must stay grey and turn into the right model numbers
test('a flat colour stays the same colour when resized, and becomes the right model numbers', () => {
  const flat: Picture = { data: new Uint8ClampedArray(630 * 880 * 4).fill(128), width: 630, height: 880 };
  const tensor = artTensor(flat, ART_BOXES['2015']);
  assert.equal(tensor.length, 3 * 224 * 224);
  // Red sheet first, then green, then blue; each is (128/255 - mean) / std
  for (let c = 0; c < 3; c++) {
    const want = (128 / 255 - MODEL_MEAN[c]) / MODEL_STD[c];
    assert.ok(Math.abs(tensor[c * 224 * 224] - want) < 1e-3, `colour sheet ${c}`);
    assert.ok(Math.abs(tensor[c * 224 * 224 + 224 * 224 - 1] - want) < 1e-3);
  }
});

// The layout of the three colour sheets
test('pictureTensor lays the colours out as three separate sheets', () => {
  const rgba = new Uint8ClampedArray(224 * 224 * 4);
  rgba[0] = 255; rgba[1] = 0; rgba[2] = 51; // the first pixel
  const t = pictureTensor(rgba);
  assert.ok(Math.abs(t[0] - (1 - MODEL_MEAN[0]) / MODEL_STD[0]) < 1e-6);
  assert.ok(Math.abs(t[224 * 224] - (0 - MODEL_MEAN[1]) / MODEL_STD[1]) < 1e-6);
  assert.ok(Math.abs(t[2 * 224 * 224] - (0.2 - MODEL_MEAN[2]) / MODEL_STD[2]) < 1e-6);
});

// 4 turns x 5 boxes
test('allArtTensors tries every turn with every art box (4 x 5 = 20)', () => {
  const list = allArtTensors(made(63, 88));
  assert.equal(list.length, TURNS.length * ART_BOX_NAMES.length);
  assert.deepEqual(ART_BOX_NAMES, ['1993', '1997', '2003', '2015', 'full']);
  assert.equal(list[0].tensor.length, 3 * 224 * 224);
});

// The fingerprint maths, with numbers small enough to work out by hand
test('poolTokens gives the summary and the average of the rest, each of length 1', () => {
  // 3 patches of 2 numbers each: the summary is (3,4); the others are (1,0) and (0,1)
  const out = poolTokens([3, 4, 1, 0, 0, 1], 3, 2);
  assert.equal(out.length, 4);
  assert.ok(Math.abs(out[0] - 0.6) < 1e-6 && Math.abs(out[1] - 0.8) < 1e-6);
  const r = Math.SQRT1_2; // the average (0.5, 0.5) scaled to length 1
  assert.ok(Math.abs(out[2] - r) < 1e-6 && Math.abs(out[3] - r) < 1e-6);
});

// ---------------------------------------------------------------------
// AGAINST THE EXPERIMENT'S OWN PICTURE LIBRARY
// ---------------------------------------------------------------------
// The test script's way of making the model numbers: turn, stretch to 630 x 880, cut the box
// (same rounding), shrink to 224 x 224, then scale the colours (this is toInput in lib.mjs)
async function reference(file: string, turn: Turn, box: readonly number[]): Promise<{ tensor: Float32Array; art: Buffer }> {
  const upright = await sharp(file).rotate(turn).resize(630, 880, { fit: 'fill' }).png().toBuffer();
  const [x0, y0, x1, y1] = box;
  const art: Buffer = await sharp(upright)
    .extract({ left: Math.round(x0 * 630), top: Math.round(y0 * 880), width: Math.round((x1 - x0) * 630), height: Math.round((y1 - y0) * 880) })
    .png()
    .toBuffer();
  const { data } = await sharp(art).removeAlpha().resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const area = 224 * 224;
  const floats = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) for (let c = 0; c < 3; c++) floats[c * area + i] = (data[i * 3 + c] / 255 - MODEL_MEAN[c]) / MODEL_STD[c];
  return { tensor: floats, art };
}

// A card cut-out file as red-green-blue-alpha numbers
async function loadCard(file: string): Promise<Picture> {
  const { data, info } = await sharp(file).removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// How far apart two lists of numbers are: the average and the biggest difference
function compare(a: Float32Array, b: Float32Array): { mean: number; max: number } {
  let sum = 0, max = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > max) max = d; }
  return { mean: sum / a.length, max };
}

// Turning must be exactly what the picture library does
test('turning matches the picture library for a real card, all four turns', { skip: skipReal }, async () => {
  const file = join(CROPS, '11-card-outline.jpg');
  const card = await loadCard(file);
  for (const turn of TURNS) {
    const mine = turnPicture(card, turn);
    const { data, info } = await sharp(file).removeAlpha().ensureAlpha().rotate(turn).raw().toBuffer({ resolveWithObject: true });
    assert.equal(mine.width, info.width);
    assert.equal(mine.height, info.height);
    assert.deepEqual([...mine.data], [...data], `turn ${turn}`);
  }
});

// The main check: the same numbers as the test script
test('the model numbers match the test script for real cards, every turn and every art box', { skip: skipReal }, async () => {
  const worst = { mean: 0, max: 0 };
  const worstUpright = { mean: 0, max: 0 }; // turns 0 and 180 only
  for (const n of ['01', '11', '22', '27']) {
    const file = join(CROPS, `${n}-card-outline.jpg`);
    const card = await loadCard(file);
    for (const turn of TURNS) {
      const upright = standardCard(card, turn);
      assert.equal(upright.width, CARD_WIDTH);
      assert.equal(upright.height, CARD_HEIGHT);
      for (const name of ART_BOX_NAMES) {
        const mine = artTensor(upright, ART_BOXES[name]);
        const { tensor } = await reference(file, turn, ART_BOXES[name]);
        const d = compare(mine, tensor);
        worst.mean = Math.max(worst.mean, d.mean);
        worst.max = Math.max(worst.max, d.max);
        // One rounding step of an 8-bit colour is about 1/255/0.226 = 0.017, so an average difference
        // under 0.02 means the two agree to within rounding. A quarter turn stretches the card (880 x 630
        // made 630 x 880), and the picture library enlarges with a different curve than it shrinks with, so
        // those are only expected to agree loosely (the outline finder never needs a quarter turn anyway).
        if (turn === 0 || turn === 180) { worstUpright.mean = Math.max(worstUpright.mean, d.mean); worstUpright.max = Math.max(worstUpright.max, d.max); }
        const allowed = turn === 0 || turn === 180 ? 0.02 : 0.12;
        assert.ok(d.mean < allowed, `photo ${n} turn ${turn} box ${name}: average difference ${d.mean}`);
      }
    }
  }
  console.log(`  model numbers vs test script, turns 0/180: worst average difference ${worstUpright.mean.toFixed(4)}, worst single number ${worstUpright.max.toFixed(3)}; with quarter turns: ${worst.mean.toFixed(4)} / ${worst.max.toFixed(3)}`);
});

// If the AI model and its program are here, check the finished fingerprints agree too
const modelFile = join(CATALOGUE, 'cache', 'models', 'dinov2-small-q.onnx');
const skipModel = haveCards && existsSync(modelFile) ? false : 'the AI model file is not on this computer';

test('the fingerprint from the app version of the numbers matches the test script fingerprint', { skip: skipModel }, async () => {
  const lib = await import(pathToFileURL(join(CATALOGUE, 'embed', 'lib.mjs')).href);
  const ort = createRequire(join(CATALOGUE, 'package.json'))('onnxruntime-node');
  const session = await lib.loadModel('dino');
  for (const n of ['11', '27']) {
    const file = join(CROPS, `${n}-card-outline.jpg`);
    const card = await loadCard(file);
    const { art } = await reference(file, 0, ART_BOXES['2015']);
    const scriptPrint: Float32Array = await lib.embedPicture('dino', art);
    const result = await session.run({ pixel_values: new ort.Tensor('float32', artTensor(standardCard(card, 0), ART_BOXES['2015']), [1, 3, 224, 224]) });
    const out = result['last_hidden_state'];
    const mine = poolTokens(out.data, out.dims[1], out.dims[2]);
    assert.equal(mine.length, 768);
    let dot = 0;
    for (let i = 0; i < 768; i++) dot += mine[i] * scriptPrint[i];
    // Each fingerprint is two halves of length 1, so identical ones give 2
    console.log(`  card ${n}: fingerprint closeness ${(dot / 2).toFixed(5)}`);
    assert.ok(dot / 2 > 0.99, `card ${n}: closeness ${dot / 2}`);
  }
});
