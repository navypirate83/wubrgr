/* =====================================================================
   THE BACKGROUND WORKER'S MESSAGES, AND WHAT IT DOES WITH THEM
   (website only, but plain TypeScript with no browser parts, so it can be tested in Node)
   Running the AI model, and finding a card's outline in a photo, are both long jobs. If they
   run on the page's own thread the whole page stutters (the camera picture, the buttons).
   So they run in a "web worker": a second program the browser runs on another processor core
   beside the page. The page and the worker can only talk by posting each other messages.
   This file is the shared language of those messages, and the worker's brain:
   - the shape of each request the page can send and each reply it gets back;
   - createWorkerHandler: given a request, does the job and makes the reply. It is handed the
     one browser-specific thing it needs (how to load the AI runtime) so a test can hand it a
     different way. It never throws: a job that fails just comes back as an "ok: false" reply.
   The real worker file (public/onnx/ai-worker.js) is made from this file and the ones it uses
   by scripts/build-ai-worker.mjs, so there is only one copy of the logic to keep right.
   Big pictures and number lists are handed over by "transfer": the worker gets the very same
   block of memory (the page loses it), instead of a copy being made.
   ===================================================================== */

import { findOutlines, flatCard } from '../core/outlineFinder.ts';
import { embedWith, type OrtLike, type OrtSession } from './aiRunModel.ts';

// What the page can ask the worker to do. Each has an "id" so the answer can be matched to the question.
//   ping:     "are you there and working?" (used to find out whether the worker file loaded at all)
//   init:     make the AI model's session from the model file's bytes (once), "wasmBase" is the folder
//             that holds the runtime's WebAssembly files
//   embed:    the model's input numbers (3 x 224 x 224 decimals) in, the 768-number fingerprint out
//   outlines: a photo's pixels (red, green, blue, alpha) in; the flat upright pictures of the card found in it out
export type WorkerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'init'; wasmBase: string; model: ArrayBuffer }
  | { id: number; type: 'embed'; tensor: ArrayBuffer }
  | { id: number; type: 'outlines'; data: ArrayBuffer; width: number; height: number };

// One flat picture handed back (its pixels are a block of memory that is transferred, not copied)
export type FlatPicture = { data: ArrayBuffer; width: number; height: number };

// What the worker answers. When a job fails, "message" says why and "returned" gives back the block of memory
// that was sent (if it can), so the page can still use it for another try.
export type WorkerReply =
  | { id: number; ok: true; vector?: ArrayBuffer; pictures?: FlatPicture[] }
  | { id: number; ok: false; message: string; returned?: ArrayBuffer };

// The AI runtime as the page's script makes it (the same shape aiModel.web.ts uses)
export type WorkerOrt = OrtLike & {
  env: { wasm: { wasmPaths?: string; numThreads?: number; proxy?: boolean } };
  InferenceSession: { create(model: Uint8Array, options?: Record<string, unknown>): Promise<OrtSession> };
};

// What the handler needs from the outside: how to load the runtime (the browser loads its script; a test
// can hand it the Node copy). It is given the folder with the runtime's files.
export type WorkerDeps = { loadOrt(wasmBase: string): Promise<WorkerOrt> };

// What the handler gives back: the reply, and the blocks of memory in it that should be transferred
export type HandlerResult = { reply: WorkerReply; transfer: ArrayBuffer[] };

// Make the worker's brain. It keeps the model's session once "init" has made it, and does one job at a time.
export function createWorkerHandler(deps: WorkerDeps): (request: WorkerRequest) => Promise<HandlerResult> {
  let model: { ort: WorkerOrt; session: OrtSession } | null = null;
  // Jobs wait for the one before (the model can only do one picture at a time)
  let turn: Promise<unknown> = Promise.resolve();

  // Do one request (this is where the actual work is)
  async function work(request: WorkerRequest): Promise<HandlerResult> {
    if (request.type === 'ping') return { reply: { id: request.id, ok: true }, transfer: [] };

    if (request.type === 'init') {
      const ort = await deps.loadOrt(request.wasmBase);
      ort.env.wasm.wasmPaths = request.wasmBase;
      // One thread and no helper of its own: this already IS a background worker
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const session = await ort.InferenceSession.create(new Uint8Array(request.model), { executionProviders: ['wasm'] });
      model = { ort, session };
      return { reply: { id: request.id, ok: true }, transfer: [] };
    }

    if (request.type === 'embed') {
      if (!model) throw new Error('The model has not been set up in the worker yet');
      const vector = await embedWith(model.ort, model.session, new Float32Array(request.tensor));
      // (the answer is its own block of memory, so it can be handed over without a copy)
      return { reply: { id: request.id, ok: true, vector: vector.buffer as ArrayBuffer }, transfer: [vector.buffer as ArrayBuffer] };
    }

    // outlines: the same search the page would have done itself, on the photo's pixels
    const photo = { data: new Uint8ClampedArray(request.data), width: request.width, height: request.height };
    const pictures: FlatPicture[] = [];
    for (const found of findOutlines(photo)) {
      const flat = flatCard(photo, found);
      const bytes = flat.data as Uint8ClampedArray;
      pictures.push({ data: bytes.buffer as ArrayBuffer, width: flat.width, height: flat.height });
    }
    return { reply: { id: request.id, ok: true, pictures }, transfer: pictures.map((p) => p.data) };
  }

  // Run a request after the ones before it, and turn any problem into an "ok: false" reply (giving the memory back)
  return (request) => {
    const result = turn.then(() => work(request)).catch((err): HandlerResult => {
      const returned = request.type === 'embed' ? request.tensor : request.type === 'outlines' ? request.data : undefined;
      // (a block of memory that was already given away can't be given back)
      const back = returned && returned.byteLength > 0 ? returned : undefined;
      return {
        reply: { id: request.id, ok: false, message: err instanceof Error ? err.message : String(err), returned: back },
        transfer: back ? [back] : [],
      };
    });
    turn = result;
    return result;
  };
}
