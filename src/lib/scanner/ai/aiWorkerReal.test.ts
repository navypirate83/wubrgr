/* =====================================================================
   CHECK THE BACKGROUND WORKER WITH THE REAL AI MODEL (skipped if the files are not on this computer)
   Run with:  node --test src/lib/scanner/ai/aiWorkerReal.test.ts
   Runs the finished worker file (public/onnx/ai-worker.js) in a real second thread (Node's worker_threads),
   with the REAL onnxruntime-web and the real model, and checks two things:
   1. PARITY: the fingerprint the worker makes for a picture is the same as running the model right here
      (the same numbers, to within rounding, and in practice exactly).
   2. THE PAGE KEEPS MOVING: while the worker is running the model, this thread's own timer keeps ticking
      (no long freezes), whereas running the model right here freezes it for the whole run.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { pictureTensor, resizePicture } from '../core/modelInput.ts';
import { embedWith, type OrtLike, type OrtSession } from './aiRunModel.ts';
import { createWorkerClient } from './workerClient.ts';

const root = resolve(import.meta.dirname, '..', '..', '..', '..');
const cache = join(root, 'scripts', 'catalogue', 'cache');
const modelFile = join(cache, 'models', 'dinov2-small-q.onnx');
const images = join(cache, 'art-images');
const missing = !existsSync(modelFile) || !existsSync(images) || !existsSync(join(root, 'public', 'onnx', 'ort-wasm-simd-threaded.wasm'));

// The longest time this thread's timer was late while "job" ran (milliseconds): a long number means the page froze
async function longestFreeze(job: () => Promise<unknown>): Promise<number> {
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; }, 5);
  try { await job(); } finally { clearInterval(timer); }
  worst = Math.max(worst, performance.now() - last);
  return worst;
}

test('the real model gives the same fingerprint in the worker as here, and the worker leaves this thread free', { skip: missing && 'the AI files are not on this computer' }, async () => {
  const wasmBase = `${pathToFileURL(join(root, 'public', 'onnx')).href}/`;
  const ortPath = createRequire(join(root, 'package.json')).resolve('onnxruntime-web');
  const model = new Uint8Array(readFileSync(modelFile));

  // The model here (the way the page runs it when it has no worker)
  const ort = createRequire(join(root, 'package.json'))('onnxruntime-web') as OrtLike & {
    env: { wasm: { wasmPaths?: string; numThreads?: number } };
    InferenceSession: { create(model: Uint8Array, options?: Record<string, unknown>): Promise<OrtSession> };
  };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = wasmBase;
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });

  // The model in the finished worker file, in a real second thread
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.self = globalThis;
    globalThis.importScripts = () => { globalThis.ort = require(workerData.ort); };
    globalThis.postMessage = (m, t) => parentPort.postMessage(m, t);
    parentPort.on('message', (m) => globalThis.onmessage({ data: m }));
    require(workerData.file);`;
  const thread = new Worker(code, { eval: true, workerData: { file: join(root, 'public', 'onnx', 'ai-worker.js'), ort: ortPath } });
  const client = createWorkerClient({
    send: (message, transfer) => thread.postMessage(message, transfer),
    onReply: (listener) => thread.on('message', listener),
    onBroken: (listener) => { thread.on('error', (e) => listener(String(e))); },
    stop: () => { void thread.terminate(); },
  });
  await client.ping();
  await client.init(wasmBase, model.slice().buffer);

  // A few real artwork pictures, as the model's input numbers
  const sharp = createRequire(join(root, 'scripts', 'catalogue', 'package.json'))('sharp');
  const names = readdirSync(images).filter((n) => n.endsWith('.jpg')).sort().slice(0, 4);
  const tensors: Float32Array[] = [];
  for (const name of names) {
    const { data, info } = await sharp(readFileSync(join(images, name))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    tensors.push(pictureTensor(resizePicture({ data, width: info.width, height: info.height }, { left: 0, top: 0, width: info.width, height: info.height }, 224, 224)));
  }
  assert.ok(tensors.length >= 3);

  // 1. parity (the worker is given copies, since the numbers are handed over)
  let worstDifference = 0;
  for (const tensor of tensors) {
    const here = await embedWith(ort, session, tensor);
    const there = await client.embed(tensor.slice());
    assert.equal(there.length, here.length);
    for (let i = 0; i < here.length; i++) worstDifference = Math.max(worstDifference, Math.abs(here[i] - there[i]));
  }
  assert.ok(worstDifference < 1e-4, `the worker's fingerprints match (largest difference ${worstDifference})`);

  // 2. the timer keeps ticking while the worker runs the model, but not while it runs here
  const freezeHere = await longestFreeze(() => embedWith(ort, session, tensors[0]));
  const freezeWorker = await longestFreeze(() => client.embed(tensors[0].slice()));
  console.log(`# longest freeze of this thread: running the model here ${freezeHere.toFixed(0)} ms, in the worker ${freezeWorker.toFixed(0)} ms (differences between fingerprints: ${worstDifference})`);
  assert.ok(freezeWorker < freezeHere / 2, `the worker leaves this thread free (${freezeWorker.toFixed(0)} ms against ${freezeHere.toFixed(0)} ms)`);
  client.stop();
});
