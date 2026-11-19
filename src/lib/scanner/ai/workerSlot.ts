/* =====================================================================
   "IS THE WORKER USABLE?": ONE PLACE THAT REMEMBERS (plain TypeScript, testable in Node)
   The scanner prefers to do its heavy jobs in a background worker, but must never depend on one:
   a browser might not allow workers, the worker file might not load, or the worker might
   crash half way. A "slot" holds one worker (made the first time it is asked for) and
   remembers, for as long as the page stays open, whether it has ever failed. After a
   failure it only ever answers "no worker", and the caller does the job on the page itself,
   exactly as it did before workers existed.
   ===================================================================== */

import type { WorkerClient } from './workerClient.ts';

// What a started worker gives back: the client to talk to it, and anything its starter wants kept with it
export type Started<Extra> = { client: WorkerClient } & Extra;

export type WorkerSlot<Extra> = {
  // The running worker, started on the first ask; null if there is none (never could start, or failed since)
  get(): Promise<Started<Extra> | null>;
  // Give up on the worker for the rest of this visit (it is shut down)
  giveUp(): void;
  // Has it failed (so no more workers will be tried)?
  readonly failed: boolean;
};

// "start" makes and checks a worker (and rejects if it can't)
export function createWorkerSlot<Extra>(start: () => Promise<Started<Extra>>): WorkerSlot<Extra> {
  let failed = false;
  let started: Promise<Started<Extra> | null> | null = null;
  let current: Started<Extra> | null = null;

  return {
    get failed() { return failed; },
    async get() {
      if (failed) return null;
      if (!started) {
        // A worker that can't be started counts as a failure, and is remembered
        started = start().then((worker) => { current = worker; return worker; }).catch((): null => { failed = true; return null; });
      }
      const worker = await started;
      // One that has broken since (crashed, or gave up waiting) counts too
      if (!worker || worker.client.broken) { failed = true; return null; }
      return worker;
    },
    giveUp() {
      failed = true;
      try { current?.client.stop(); } catch { /* already gone */ }
      current = null;
    },
  };
}
