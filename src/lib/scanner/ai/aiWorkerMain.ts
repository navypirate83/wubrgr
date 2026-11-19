/* =====================================================================
   THE BACKGROUND WORKER'S OWN START-UP (the last part of public/onnx/ai-worker.js)
   This file is NOT imported by the app. scripts/build-ai-worker.mjs joins it onto the end of the pieces it
   needs (workerProtocol.ts and what that uses) to make the one plain script file the browser runs as a worker.
   It does the three things only a real worker does:
     1. loads the AI runtime when asked: the runtime is a script (ort.wasm.min.js) that is fetched into the worker
        with "importScripts" and leaves a tool called "ort" behind;
     2. listens for the page's messages, and gives each to the handler (workerProtocol.ts);
     3. posts each reply back, handing over the big blocks of memory instead of copying them.
   ===================================================================== */

import { createWorkerHandler, type HandlerResult, type WorkerOrt, type WorkerRequest } from './workerProtocol.ts';

// The worker's own surroundings, as far as is needed here
type WorkerScope = {
  importScripts(...urls: string[]): void;
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  ort?: WorkerOrt;
};
const scope = globalThis as unknown as WorkerScope;

// The brain: loads the runtime's script from the folder it is told about
const handle = createWorkerHandler({
  async loadOrt(wasmBase) {
    if (!scope.ort) scope.importScripts(`${wasmBase}ort.wasm.min.js`);
    if (!scope.ort) throw new Error('The AI runtime (onnxruntime-web) could not be loaded in the worker');
    return scope.ort;
  },
});

// Each message from the page: do the job, send the answer back
scope.onmessage = (event) => {
  handle(event.data).then((result: HandlerResult) => scope.postMessage(result.reply, result.transfer));
};
