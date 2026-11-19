/* =====================================================================
   THE AI MODEL: THE WEBSITE
   Runs the model with onnxruntime-web (the model runs as WebAssembly, a fast
   kind of code every modern browser can run). Nothing from it is part of the
   app's main download: only when the scanner first needs the AI, a script tag
   is added for onnxruntime-web's own script from public/onnx/ (copies of the
   files in the package, committed so they match the version in package.json;
   see the README there), the same way sql.js and Tesseract are loaded.
   The model file itself is not here either: it is one of the AI files kept in
   the browser's storage (see aiFiles.ts), read and handed to the runtime.
   Runs on one thread (the site is on GitHub Pages, which cannot send the
   special headers the faster many-thread kind needs).
   The model is made once, the first time it is needed, and kept.
   WHERE IT RUNS: first choice is a background web worker (see aiWorker.web.ts), so the page, the camera
   picture and the buttons keep moving while the model works (a run takes a good fraction of a second and, on
   the page's own thread, freezes everything meanwhile). The numbers for each picture, and the model file, are
   handed over to the worker by transfer, not copied. If the worker can't be used for ANY reason (no web workers,
   the worker file did not load, the model would not load in it, it crashed or took too long), that is
   remembered until the page is closed and everything runs on the page's own thread, the way it did before
   there were workers. Only a worker that crashes in the middle of a picture can lose that one picture's
   fingerprint (its numbers were handed over); that scan simply gets no AI clue, the next one runs on the page.
   ===================================================================== */

import { readAiFile } from './aiFiles';
import { embedWith, type OrtLike, type OrtSession } from './aiRunModel';
import type { AiModel } from './aiModel';
import { modelWorker } from './aiWorker.web';
import { WorkerJobError, type WorkerClient } from './workerClient';

// The runtime's own shape: what its script puts on the page as "ort"
type Ort = OrtLike & {
  env: { wasm: { wasmPaths?: string; numThreads?: number; proxy?: boolean } };
  InferenceSession: { create(model: Uint8Array, options?: Record<string, unknown>): Promise<OrtSession> };
};
const pageOrt = (): Ort | undefined => (globalThis as unknown as { ort?: Ort }).ort;

// Add a script to the page and wait until it has loaded
function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(script);
  });
}

// The model, made once (a promise: whoever asks while it is still loading waits for the same one)
let session: Promise<{ ort: Ort; session: OrtSession }> | null = null;

function loadSession() {
  if (!session) {
    session = (async () => {
      // The site lives in a folder of its own on GitHub Pages (/wubrgr/) but at the top while developing: try both
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
      let folder = '';
      for (const candidate of [`${base}/onnx`, '/onnx']) {
        try { await addScript(`${candidate}/ort.wasm.min.js`); folder = candidate; break; } catch { /* try the next */ }
      }
      const ort = pageOrt();
      if (!folder || !ort) throw new Error('The AI runtime (onnxruntime-web) could not be loaded');
      // Where its WebAssembly files are, and run it on one thread
      ort.env.wasm.wasmPaths = `${location.origin}${folder}/`;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const bytes = await readAiFile('model.onnx');
      if (!bytes) throw new Error('The AI model file has not been downloaded');
      return { ort, session: await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }) };
    })();
    session.catch(() => { session = null; });
  }
  return session;
}

// The model in the background worker: made (the model file handed over and set up) once the first time it is
// asked for. Gives null if the worker can't be used (then the page runs the model itself). If the model file has
// not been downloaded that is an error to pass on, as it is on the page's own thread.
let inWorker: Promise<WorkerClient | null> | null = null;

function workerModel(): Promise<WorkerClient | null> {
  if (!inWorker) {
    inWorker = (async () => {
      const worker = await modelWorker.get();
      if (!worker) return null;
      const bytes = await readAiFile('model.onnx');
      if (!bytes) throw new Error('The AI model file has not been downloaded');
      // The file's memory is handed over to the worker (if it is only part of a bigger block, the part is copied out)
      const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
      const block = (whole ? bytes : bytes.slice()).buffer as ArrayBuffer;
      try {
        await worker.client.init(worker.wasmBase, block);
        return worker.client;
      } catch {
        // The worker could not set the model up: give up on workers; the page does it itself
        modelWorker.giveUp();
        return null;
      }
    })();
    // (a missing model file is tried again on the next ask)
    inWorker.catch(() => { inWorker = null; });
  }
  return inWorker;
}

// Run one picture on the page's own thread (the way it was before workers, and the way back if a worker fails)
async function embedOnPage(tensor: Float32Array): Promise<Float32Array> {
  const { ort, session: ready } = await loadSession();
  return embedWith(ort, ready, tensor);
}

// The model can only do one picture at a time, so each one waits for the one before it
let queue: Promise<unknown> = Promise.resolve();

export const aiModel: AiModel = {
  available: true,
  embed(tensor) {
    const result = queue.then(async () => {
      const worker = await workerModel();
      if (worker && !worker.broken) {
        try {
          return await worker.embed(tensor);
        } catch (err) {
          // Any trouble: stop using the worker for the rest of this visit, and do this picture on the page.
          // The picture's numbers were handed to the worker; they come back with a failed job, but not if the worker died.
          modelWorker.giveUp();
          const back = err instanceof WorkerJobError && err.returned ? new Float32Array(err.returned) : tensor.buffer.byteLength > 0 ? tensor : null;
          if (!back) throw err;
          return embedOnPage(back);
        }
      }
      return embedOnPage(tensor);
    });
    queue = result.catch(() => { /* the next picture still runs */ });
    return result;
  },
};
