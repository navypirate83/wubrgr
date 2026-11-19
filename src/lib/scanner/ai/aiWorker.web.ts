/* =====================================================================
   THE BACKGROUND WORKERS: THE WEBSITE'S SIDE (where they are made)
   Two web workers can be started from here, both running the same file (public/onnx/ai-worker.js,
   made from workerProtocol.ts by scripts/build-ai-worker.mjs):
     - the "model" worker holds the AI model's session and runs it (see aiModel.web.ts);
     - the "outline" worker finds the card in a photo (see aiPhoto.web.ts).
   They are separate so finding the next card's outline is never stuck waiting behind a model run.
   Neither is part of the app's main download: the worker file is only fetched when the scanner first needs
   the AI, from this same website (so no outside address, the same as the other files in public/onnx), and the
   service worker (public/sw.js) keeps a copy for offline use.
   If a worker can't be used for ANY reason (the browser has no Worker, the file did not load, it crashed,
   it took too long), that is remembered until the page is closed (see workerSlot.ts) and the
   callers do the work on the page, as before. Nothing is ever shown to the person about it.
   ===================================================================== */

import type { RgbaPicture } from '../core/perspective';
import { createWorkerClient, type WorkerPort } from './workerClient';
import { createWorkerSlot, type WorkerSlot } from './workerSlot';

// Where the worker file lives, as a tail on the site's folder. The site lives in a folder of its own on GitHub Pages
// (/wubrgr/) but at the top while developing, so both are tried (the same as the other files in public/onnx).
const WORKER_FILE = 'ai-worker.js';

// A real browser Worker, put in the shape the client wants
function browserPort(worker: Worker): WorkerPort {
  return {
    send: (message, transfer) => worker.postMessage(message, transfer),
    onReply: (listener) => { worker.onmessage = (event) => listener(event.data); },
    onBroken: (listener) => {
      worker.onerror = (event) => listener(event.message || 'The worker file could not be loaded or crashed');
      worker.onmessageerror = () => listener('The worker sent something the page could not read');
    },
    stop: () => worker.terminate(),
  };
}

// Start a worker and check that it really runs (it must answer a ping). The folder is whichever of the two
// candidates has the file. "wasmBase" is the folder (as a full address) holding the AI runtime's files, which the
// model worker needs.
async function startWorker(): Promise<{ client: ReturnType<typeof createWorkerClient>; wasmBase: string }> {
  if (typeof Worker === 'undefined') throw new Error('This browser has no web workers');
  const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
  let lastError: unknown = new Error('No worker file found');
  for (const folder of [`${base}/onnx`, '/onnx']) {
    const client = createWorkerClient(browserPort(new Worker(`${location.origin}${folder}/${WORKER_FILE}`)));
    try {
      await client.ping();
      return { client, wasmBase: `${location.origin}${folder}/` };
    } catch (err) {
      lastError = err;
      client.stop();
    }
  }
  throw lastError;
}

// The two slots (each starts its worker the first time it is asked for)
export const modelWorker: WorkerSlot<{ wasmBase: string }> = createWorkerSlot(startWorker);
export const outlineWorker: WorkerSlot<{ wasmBase: string }> = createWorkerSlot(startWorker);

// Find the card in a photo in the outline worker. "data" is the photo's pixels (red, green, blue, alpha); its memory
// is handed over to the worker, so the caller must not use it afterwards (get the pixels again if it has to).
// Gives null if the worker can't be used (the caller then does the search itself); the flat pictures otherwise.
export async function outlinePicturesInWorker(data: ArrayBuffer, width: number, height: number): Promise<RgbaPicture[] | null> {
  const worker = await outlineWorker.get();
  if (!worker) return null;
  try {
    const pictures = await worker.client.outlines(data, width, height);
    return pictures.map((p) => ({ data: new Uint8ClampedArray(p.data), width: p.width, height: p.height }));
  } catch {
    outlineWorker.giveUp();
    return null;
  }
}
