/* =====================================================================
   TALKING TO A BACKGROUND WORKER FROM THE PAGE (plain TypeScript, testable in Node)
   The page sends the worker a request and waits for its reply (see workerProtocol.ts).
   This file keeps track of which question each reply answers, gives every question a time
   limit, and turns everything that can go wrong into one clear thing: a rejected promise.
   It knows nothing about the browser: it is handed a "port", a small object with the four
   things it needs (send a message, hear replies, hear that the worker broke, shut it down).
   aiWorker.web.ts makes the port from a real browser Worker; the tests make one from
   Node's worker_threads, so the very same code is checked in both places.
   Two kinds of trouble are kept apart:
   - "WorkerBrokenError": the worker itself is gone or too slow (it crashed, never started, never answered).
     The caller should stop using workers and do the job on the page instead.
   - "WorkerJobError": the worker is fine but this one job failed (say, the model could not run). It carries
     the memory block back, when it could be rescued, so the caller can try again on the page.
   ===================================================================== */

import type { FlatPicture, WorkerReply, WorkerRequest } from './workerProtocol.ts';

// The four things a port must do
export type WorkerPort = {
  send(message: WorkerRequest, transfer: ArrayBuffer[]): void;
  onReply(listener: (reply: WorkerReply) => void): void;
  onBroken(listener: (reason: string) => void): void;
  stop(): void;
};

// The worker itself is gone or stuck
export class WorkerBrokenError extends Error {}
// The worker is fine; this job failed. "returned" is the job's memory block, given back if possible.
export class WorkerJobError extends Error {
  returned?: ArrayBuffer;
  constructor(message: string, returned?: ArrayBuffer) {
    super(message);
    this.returned = returned;
  }
}

// How long each kind of request may take before the worker is given up on (milliseconds). Setting up the model
// reads a 24 MB file into the runtime, so it is given a lot longer than the rest.
export const TIME_LIMITS = { ping: 10_000, init: 120_000, embed: 60_000, outlines: 60_000 } as const;

// Loose requests: everything except the "id", which the client adds
type Without<T> = T extends unknown ? Omit<T, 'id'> : never;
export type LooseRequest = Without<WorkerRequest>;

export type WorkerClient = {
  // Send a request and wait for its reply (rejects with one of the two errors above)
  request(request: LooseRequest, transfer: ArrayBuffer[]): Promise<WorkerReply & { ok: true }>;
  // True once the worker has been given up on (nothing more can be sent to it)
  readonly broken: boolean;
  // Shut the worker down
  stop(): void;
  // Handy ways to ask for each job
  ping(): Promise<void>;
  init(wasmBase: string, model: ArrayBuffer): Promise<void>;
  embed(tensor: Float32Array): Promise<Float32Array>;
  outlines(data: ArrayBuffer, width: number, height: number): Promise<FlatPicture[]>;
};

// Make a client for a port.
export function createWorkerClient(port: WorkerPort): WorkerClient {
  let nextId = 1;
  let broken = false;
  // The questions still waiting for an answer
  const waiting = new Map<number, { resolve: (reply: WorkerReply & { ok: true }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  // The worker is gone: every waiting question fails, and nothing more can be asked
  function breakDown(reason: string) {
    if (broken) return;
    broken = true;
    for (const [, job] of waiting) { clearTimeout(job.timer); job.reject(new WorkerBrokenError(reason)); }
    waiting.clear();
    try { port.stop(); } catch { /* it is being given up on anyway */ }
  }

  port.onReply((reply) => {
    const job = waiting.get(reply.id);
    if (!job) return;
    waiting.delete(reply.id);
    clearTimeout(job.timer);
    if (reply.ok) job.resolve(reply);
    else job.reject(new WorkerJobError(reply.message, reply.returned));
  });
  port.onBroken((reason) => breakDown(reason));

  function request(loose: LooseRequest, transfer: ArrayBuffer[]) {
    if (broken) return Promise.reject(new WorkerBrokenError('The worker is not running'));
    const id = nextId++;
    return new Promise<WorkerReply & { ok: true }>((resolve, reject) => {
      const limit = TIME_LIMITS[loose.type];
      const timer = setTimeout(() => breakDown(`The worker did not answer a "${loose.type}" request in ${limit / 1000} seconds`), limit);
      waiting.set(id, { resolve, reject, timer });
      try {
        port.send({ ...loose, id } as WorkerRequest, transfer);
      } catch (err) {
        // (sending can fail if the worker is already gone, or if the memory can't be transferred)
        waiting.delete(id);
        clearTimeout(timer);
        reject(new WorkerBrokenError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  return {
    request,
    get broken() { return broken; },
    stop() { breakDown('The worker was shut down'); },
    async ping() { await request({ type: 'ping' }, []); },
    async init(wasmBase, model) { await request({ type: 'init', wasmBase, model }, [model]); },
    async embed(tensor) {
      // The tensor's memory block is handed over to the worker (the page can no longer use it). If the numbers
      // are only part of a bigger block, the part is copied out first so nothing else is handed over by mistake.
      const whole = tensor.byteOffset === 0 && tensor.byteLength === tensor.buffer.byteLength;
      const block = (whole ? tensor : tensor.slice()).buffer as ArrayBuffer;
      const reply = await request({ type: 'embed', tensor: block }, [block]);
      if (!reply.vector) throw new WorkerJobError('The worker gave no fingerprint');
      return new Float32Array(reply.vector);
    },
    async outlines(data, width, height) {
      const reply = await request({ type: 'outlines', data, width, height }, [data]);
      return reply.pictures ?? [];
    },
  };
}
