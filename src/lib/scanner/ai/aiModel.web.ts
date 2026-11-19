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
   ===================================================================== */

import { readAiFile } from './aiFiles';
import { embedWith, type OrtLike, type OrtSession } from './aiRunModel';
import type { AiModel } from './aiModel';

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

// The model can only do one picture at a time, so each one waits for the one before it
let queue: Promise<unknown> = Promise.resolve();

export const aiModel: AiModel = {
  available: true,
  embed(tensor) {
    const result = queue.then(async () => {
      const { ort, session: ready } = await loadSession();
      return embedWith(ort, ready, tensor);
    });
    queue = result.catch(() => { /* the next picture still runs */ });
    return result;
  },
};
