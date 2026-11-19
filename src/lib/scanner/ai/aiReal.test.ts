/* =====================================================================
   CHECKS WITH THE REAL AI FILES (skipped if they are not on this computer)
   Run with:  node --test src/lib/scanner/ai/aiReal.test.ts
   Uses the real model and fingerprints from scripts/catalogue/cache (made by
   the experiment). It runs the model the way the WEBSITE does (onnxruntime-web,
   the WebAssembly runtime, with the app's own wasm files from public/onnx) and
   checks three things:
   1. PARITY: the fingerprint the website's code path makes for a catalogue
      artwork picture is nearly the same as the one the experiment's test script
      makes (scripts/catalogue/embed/lib.mjs, which uses sharp and onnxruntime-node).
   2. LOOKUP: that fingerprint, shrunk and compared with the saved ones, finds
      its own artwork first.
   3. END TO END: a made-up card (the artwork pasted into the art box of a grey
      card picture) is scored by aiScoresFor, and the right artwork's printing
      comes out best.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ART_BY_ERA } from '../core/scannerTypes.ts';
import { pictureTensor, resizePicture } from '../core/modelInput.ts';
import { createAiIndex } from './aiIndex.ts';
import { aiScoresFor } from './aiClue.ts';
import { embedWith, type OrtLike, type OrtSession } from './aiRunModel.ts';

const root = resolve(import.meta.dirname, '..', '..', '..', '..');
const cache = join(root, 'scripts', 'catalogue', 'cache');
const files = {
  model: join(cache, 'models', 'dinov2-small-q.onnx'),
  vectors: join(cache, 'embed-index', 'art-vectors.bin'),
  ids: join(cache, 'embed-index', 'art-ids.txt'),
  projection: join(cache, 'embed-index', 'projection.bin'),
  images: join(cache, 'art-images'),
};
const missing = Object.values(files).some((f) => !existsSync(f)) || !existsSync(join(root, 'public', 'onnx', 'ort-wasm-simd-threaded.wasm'));

test('the website path matches the test script, finds its own artwork, and ranks a made-up card right', { skip: missing && 'the AI files are not on this computer' }, async () => {
  // The tools: sharp (to read pictures), the website's runtime, and the test script's own embedding code
  const fromScripts = createRequire(join(root, 'scripts', 'catalogue', 'package.json'));
  const sharp = fromScripts('sharp');
  const ort = createRequire(join(root, 'package.json'))('onnxruntime-web') as OrtLike & {
    env: { wasm: { wasmPaths?: string; numThreads?: number } };
    InferenceSession: { create(model: Uint8Array, options?: Record<string, unknown>): Promise<OrtSession> };
  };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${pathToFileURL(join(root, 'public', 'onnx')).href}/`;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(files.model)), { executionProviders: ['wasm'] });
  const script = await import(pathToFileURL(join(root, 'scripts', 'catalogue', 'embed', 'lib.mjs')).href);

  const index = createAiIndex(new Uint8Array(readFileSync(files.vectors)), readFileSync(files.ids, 'utf8'), new Uint8Array(readFileSync(files.projection)));
  assert.ok(index.rows > 50000);

  // A few artwork pictures that are in the saved index (the file name is the artwork's id)
  const names = readdirSync(files.images).filter((n) => n.endsWith('.jpg')).sort().slice(0, 40);
  const chosen: { id: string; jpeg: Buffer }[] = [];
  for (const name of names) {
    const id = name.replace(/\.jpg$/, '');
    if (index.similarityToIllustration(new Int8Array(256), id) !== null && chosen.length < 8) chosen.push({ id, jpeg: readFileSync(join(files.images, name)) });
  }
  assert.ok(chosen.length >= 5, 'enough artwork pictures to test with');

  let found = 0;
  const fingerprints = new Map<string, Float32Array>();
  for (const { id, jpeg } of chosen) {
    // 1. the website's way: red-green-blue-alpha pixels, the whole picture shrunk to 224 x 224, then the model and the pooling
    const { data, info } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const picture = { data, width: info.width, height: info.height };
    const web = await embedWith(ort, session, pictureTensor(resizePicture(picture, { left: 0, top: 0, width: info.width, height: info.height }, 224, 224)));
    fingerprints.set(id, web);
    // the test script's way (each half of a fingerprint has length 1, so the closeness is the sum divided by 2)
    const reference: Float32Array = await script.embedPicture('dino', jpeg);
    let dot = 0;
    for (let i = 0; i < web.length; i++) dot += web[i] * reference[i];
    assert.ok(dot / 2 > 0.99, `the two ways agree for ${id} (${(dot / 2).toFixed(4)})`);
    // 2. the lookup finds the artwork itself
    if (index.nearestArt(web, 1)[0].illustrationId === id) found++;
  }
  assert.ok(found >= chosen.length - 1, `the right artwork is first for ${found} of ${chosen.length}`);

  // 3. a made-up card: the first artwork pasted into the modern art box of a grey card picture
  const target = chosen[0];
  const box = ART_BY_ERA['2015'];
  const art = await sharp(target.jpeg).resize(Math.round((box[2] - box[0]) * 630), Math.round((box[3] - box[1]) * 880), { fit: 'fill' }).toBuffer();
  const card = await sharp({ create: { width: 630, height: 880, channels: 4, background: { r: 60, g: 60, b: 60, alpha: 1 } } })
    .composite([{ input: art, left: Math.round(box[0] * 630), top: Math.round(box[1] * 880) }]).raw().toBuffer();
  const scores = await aiScoresFor(
    [{ data: card, width: 630, height: 880 }],
    chosen.slice(0, 4).map((c, i) => ({ id: `print${i}`, illus: c.id, frame: '2015' })),
    { embed: (tensor) => embedWith(ort, session, tensor), index },
  );
  assert.ok(scores);
  const best = [...scores!.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.equal(best[0], 'print0');
  assert.ok(best[1] > 0.8, `a close match scores high (${best[1].toFixed(2)})`);
});
