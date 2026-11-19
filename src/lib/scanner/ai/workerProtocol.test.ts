/* =====================================================================
   CHECKS FOR THE BACKGROUND WORKER (workerProtocol.ts, workerClient.ts, workerSlot.ts)
   Run with:  node --test src/lib/scanner/ai/workerProtocol.test.ts
   Three layers, each checked on its own and then together:
   1. The worker's brain (createWorkerHandler) with a pretend AI runtime: each kind of request, and that a
      failed job comes back as an "ok: false" reply with the memory handed back.
   2. The page's side (createWorkerClient) talking to a REAL second thread (Node's worker_threads, which
      behaves like a browser worker: separate thread, messages, transfer of memory), running the same brain.
   3. The "is a worker usable?" memory (createWorkerSlot) and the finished worker file
      (public/onnx/ai-worker.js): it is up to date with its sources, and runs in a real second thread.
   What these cannot check is a real browser: fetching the file over the web, the service worker, and
   importScripts / import() inside a browser worker.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { findOutlines, flatCard } from '../core/outlineFinder.ts';
import { embedWith } from './aiRunModel.ts';
import { createWorkerHandler, type WorkerOrt, type WorkerReply } from './workerProtocol.ts';
import { createWorkerClient, WorkerBrokenError, WorkerJobError, type WorkerPort } from './workerClient.ts';
import { createWorkerSlot } from './workerSlot.ts';

const root = resolve(import.meta.dirname, '..', '..', '..', '..');

// A pretend AI runtime: its "model" answers 3 tokens of 4 numbers each, made from the input's first numbers
const fakeOrt: WorkerOrt = {
  Tensor: class { data: Float32Array; dims: number[]; constructor(_type: string, data: Float32Array, dims: number[]) { this.data = data; this.dims = dims; } } as unknown as WorkerOrt['Tensor'],
  env: { wasm: {} },
  InferenceSession: {
    async create(bytes) {
      if (bytes.length === 0) throw new Error('empty model');
      return {
        outputNames: ['last_hidden_state'],
        async run(feeds) {
          const input = (feeds.pixel_values as { data: Float32Array }).data;
          const out = new Float32Array(12);
          for (let i = 0; i < 12; i++) out[i] = input[i] + i + 1;
          return { last_hidden_state: { data: out, dims: [1, 3, 4] } };
        },
      };
    },
  },
};
const fakeDeps = { loadOrt: async () => fakeOrt };
const sample = () => Float32Array.from({ length: 3 * 224 * 224 }, (_, i) => (i % 7) / 7);

// The same pretend runtime as text, for the code that runs inside the second thread
const fakeOrtSource = `({
  Tensor: class { constructor(t, data, dims) { this.data = data; this.dims = dims; } },
  env: { wasm: {} },
  InferenceSession: { create: async (b) => { if (b.length === 0) throw new Error('empty model'); return {
    outputNames: ['last_hidden_state'],
    run: async (f) => { const i = f.pixel_values.data; const o = new Float32Array(12); for (let k = 0; k < 12; k++) o[k] = i[k] + k + 1; return { last_hidden_state: { data: o, dims: [1, 3, 4] } }; } }; } },
})`;

// A made-up photo with a bright card on a mid-grey table (the card finder should find it)
function photo() {
  const width = 200, height = 150;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const onCard = x > 60 && x < 60 + 64 && y > 20 && y < 20 + 90;
    const v = onCard ? (x > 66 && x < 118 && y > 26 && y < 104 ? 150 : 235) : 100 + ((x * 7 + y * 13) % 30);
    const at = (y * width + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = v;
    data[at + 3] = 255;
  }
  return { data, width, height };
}

// Node's worker thread in the shape the client wants
function nodePort(thread: Worker): WorkerPort & { thread: Worker } {
  return {
    thread,
    send: (message, transfer) => thread.postMessage(message, transfer),
    onReply: (listener) => thread.on('message', (m: WorkerReply) => listener(m)),
    onBroken: (listener) => { thread.on('error', (e) => listener(String(e))); thread.on('exit', (code) => listener(`exited with ${code}`)); },
    stop: () => { void thread.terminate(); },
  };
}

// A real worker thread running the brain from the TypeScript source, with the pretend runtime.
// (A message of type "crash" makes it die, to check that is noticed.)
function brainThread() {
  const code = `
    const { parentPort } = require('node:worker_threads');
    import(${JSON.stringify(pathToFileURL(join(root, 'src/lib/scanner/ai/workerProtocol.ts')).href)}).then(({ createWorkerHandler }) => {
      const handle = createWorkerHandler({ loadOrt: async () => (${fakeOrtSource}) });
      parentPort.on('message', async (m) => {
        if (m.type === 'crash') process.exit(3);
        const r = await handle(m);
        parentPort.postMessage(r.reply, r.transfer);
      });
    });`;
  return nodePort(new Worker(code, { eval: true }));
}

// The finished worker file in a real second thread, with the few things a browser worker has made up for it
// (importScripts, postMessage, onmessage), and the pretend runtime in place of the real one
function shippedWorkerThread() {
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.self = globalThis;
    globalThis.importScripts = () => { globalThis.ort = ${fakeOrtSource}; };
    globalThis.postMessage = (m, t) => parentPort.postMessage(m, t);
    parentPort.on('message', (m) => globalThis.onmessage({ data: m }));
    require(workerData.file);`;
  return nodePort(new Worker(code, { eval: true, workerData: { file: join(root, 'public', 'onnx', 'ai-worker.js') } }));
}

/* ----- 1. the brain ----- */

test('the brain answers a ping, sets up the model, and gives the same fingerprint as running it directly', async () => {
  const handle = createWorkerHandler(fakeDeps);
  assert.deepEqual((await handle({ id: 1, type: 'ping' })).reply, { id: 1, ok: true });
  assert.equal((await handle({ id: 2, type: 'init', wasmBase: 'x/', model: new Uint8Array([1, 2, 3]).buffer })).reply.ok, true);
  const tensor = sample();
  const { reply, transfer } = await handle({ id: 3, type: 'embed', tensor: tensor.slice().buffer });
  assert.equal(reply.ok, true);
  const direct = await embedWith(fakeOrt, await fakeOrt.InferenceSession.create(new Uint8Array(1)), tensor);
  assert.deepEqual(Array.from(new Float32Array((reply as { vector: ArrayBuffer }).vector)), Array.from(direct));
  assert.equal(transfer.length, 1);
});

test('a job that fails comes back as a failed reply with the memory handed back; the brain keeps working', async () => {
  const handle = createWorkerHandler(fakeDeps);
  // asking for a fingerprint before the model is set up
  const early = await handle({ id: 1, type: 'embed', tensor: sample().buffer });
  assert.equal(early.reply.ok, false);
  assert.match((early.reply as { message: string }).message, /not been set up/);
  assert.equal((early.reply as { returned?: ArrayBuffer }).returned?.byteLength, 3 * 224 * 224 * 4);
  // a model that will not load
  const bad = await handle({ id: 2, type: 'init', wasmBase: 'x/', model: new ArrayBuffer(0) });
  assert.equal(bad.reply.ok, false);
  // and it still answers afterwards
  assert.equal((await handle({ id: 3, type: 'ping' })).reply.ok, true);
});

test('the outline job gives the same flat pictures as doing the search directly', async () => {
  const handle = createWorkerHandler(fakeDeps);
  const p = photo();
  const direct = findOutlines(p).map((found) => flatCard(p, found));
  assert.ok(direct.length >= 1, 'the made-up card was found');
  const { reply } = await handle({ id: 1, type: 'outlines', data: p.data.slice().buffer, width: p.width, height: p.height });
  assert.equal(reply.ok, true);
  const got = (reply as { pictures: { data: ArrayBuffer; width: number; height: number }[] }).pictures;
  assert.equal(got.length, direct.length);
  got.forEach((g, i) => {
    assert.equal(g.width, direct[i].width);
    assert.deepEqual(Buffer.from(g.data), Buffer.from((direct[i].data as Uint8ClampedArray).buffer));
  });
});

/* ----- 2. the page's side with a real second thread ----- */

test('the client and a real worker thread: ping, set up, fingerprint (transferred), outlines', async () => {
  const client = createWorkerClient(brainThread());
  await client.ping();
  const model = new Uint8Array([9, 9, 9]).buffer;
  await client.init('x/', model);
  assert.equal(model.byteLength, 0, 'the model file was handed over, not copied');
  const tensor = sample();
  const expected = Array.from(await embedWith(fakeOrt, await fakeOrt.InferenceSession.create(new Uint8Array(1)), tensor));
  const got = await client.embed(tensor);
  assert.equal(tensor.buffer.byteLength, 0, 'the tensor was handed over, not copied');
  assert.deepEqual(Array.from(got), expected);
  const p = photo();
  const data = p.data.slice().buffer;
  const pictures = await client.outlines(data, p.width, p.height);
  assert.equal(data.byteLength, 0);
  assert.equal(pictures.length, findOutlines(p).length);
  assert.equal(pictures[0].width, 630);
  client.stop();
  assert.equal(client.broken, true);
});

test('a failed job in a real worker gives the memory back and leaves the worker usable', async () => {
  const client = createWorkerClient(brainThread());
  await client.ping();
  // (the model was never set up, so the fingerprint job fails)
  await assert.rejects(() => client.embed(sample()), (err) => err instanceof WorkerJobError && err.returned?.byteLength === 3 * 224 * 224 * 4);
  assert.equal(client.broken, false);
  await client.ping();
  client.stop();
});

test('a worker that dies makes the waiting jobs fail with the "broken" error, and nothing more is sent', async () => {
  const port = brainThread();
  const client = createWorkerClient(port);
  await client.ping();
  // (the crash message goes first, so the ping is still waiting when the worker dies)
  port.thread.postMessage({ type: 'crash' });
  const waiting = client.ping();
  await assert.rejects(() => waiting, WorkerBrokenError);
  assert.equal(client.broken, true);
  await assert.rejects(() => client.ping(), WorkerBrokenError);
});

test('a worker that never loads (the browser reports an error) is given up on', async () => {
  let report: (reason: string) => void = () => {};
  const silent: WorkerPort = { send() {}, onReply() {}, onBroken(listener) { report = listener; }, stop() {} };
  const client = createWorkerClient(silent);
  const waiting = client.ping();
  report('the worker file could not be loaded');
  await assert.rejects(() => waiting, WorkerBrokenError);
  assert.equal(client.broken, true);
});

/* ----- 3. remembering a failure ----- */

test('the slot starts the worker once, and after any failure never tries again', async () => {
  let starts = 0;
  const slot = createWorkerSlot(async () => { starts++; const client = createWorkerClient(brainThread()); await client.ping(); return { client }; });
  const a = await slot.get();
  const b = await slot.get();
  assert.equal(starts, 1);
  assert.equal(a, b);
  assert.equal(slot.failed, false);
  slot.giveUp();
  assert.equal(slot.failed, true);
  assert.equal(await slot.get(), null);
  assert.equal(starts, 1);
});

test('a worker that cannot start, or that has broken since, counts as a failure', async () => {
  const slotA = createWorkerSlot(async () => { throw new Error('no Worker here'); });
  assert.equal(await slotA.get(), null);
  assert.equal(slotA.failed, true);
  const slotB = createWorkerSlot(async () => { const client = createWorkerClient(brainThread()); await client.ping(); return { client }; });
  const worker = await slotB.get();
  worker!.client.stop();
  assert.equal(await slotB.get(), null);
  assert.equal(slotB.failed, true);
});

/* ----- the finished worker file ----- */

test('public/onnx/ai-worker.js is up to date with the TypeScript it is made from', () => {
  const out = execFileSync(process.execPath, [join(root, 'scripts', 'build-ai-worker.mjs'), '--check'], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  assert.match(out, /up to date/);
});

test('the finished worker file has no imports or exports left in it', () => {
  const text = readFileSync(join(root, 'public', 'onnx', 'ai-worker.js'), 'utf8');
  assert.doesNotMatch(text, /^\s*(import|export)\s/m);
});

test('the finished worker file runs in a real second thread and gives the same answers as the source', async () => {
  const client = createWorkerClient(shippedWorkerThread());
  await client.ping();
  await client.init('x/', new Uint8Array([1]).buffer);
  const tensor = sample();
  const expected = Array.from(await embedWith(fakeOrt, await fakeOrt.InferenceSession.create(new Uint8Array(1)), tensor));
  assert.deepEqual(Array.from(await client.embed(tensor)), expected);
  const p = photo();
  const direct = findOutlines(p).map((found) => flatCard(p, found));
  const pictures = await client.outlines(p.data.slice().buffer, p.width, p.height);
  assert.equal(pictures.length, direct.length);
  assert.deepEqual(Buffer.from(pictures[0].data), Buffer.from((direct[0].data as Uint8ClampedArray).buffer));
  client.stop();
});
