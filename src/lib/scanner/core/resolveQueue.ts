/* =====================================================================
   RESULTS IN THE ORDER THE CARDS WERE SCANNED (shared, plain TypeScript, no imports)
   With the scan queue, several cards can be worked out at the same time, and an
   easy card can finish before an earlier, harder one. Without care the list
   would then show the cards in the wrong order. This works like a queue at a
   shop: each scan takes a numbered ticket when it is read; when its answer is
   ready it hands in what to do with the answer, and the answers are put to use
   strictly in ticket order. A card is never lost or used twice:
   - a scan that fails gives its ticket back with "skip", so the ones behind it
     are not held up;
   - if an earlier scan takes far too long (the "hold limit"), the later answers
     go ahead without it, and its own answer is still used when it arrives.
   ===================================================================== */

export type OrderedResults = {
  // Take the next ticket (call this when a scan starts)
  ticket(): number;
  // The scan with this ticket has an answer: "use" is what to do with it, and it is run in ticket order
  finish(ticket: number, use: () => void): void;
  // The scan with this ticket has nothing to use (it failed or was dropped)
  skip(ticket: number): void;
  // How many tickets have been taken and not yet finished or skipped
  waiting(): number;
};

// The two timer arguments are only there so tests can use a pretend clock
export function createOrderedResults(
  holdLimitMs = 20000,
  setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
): OrderedResults {
  let issued = 0;                                          // tickets handed out so far
  let settled = 0;                                         // tickets finished or skipped (each counted once)
  let next = 0;                                            // the ticket whose turn it is
  const ready = new Map<number, (() => void) | null>();    // answers waiting for their turn (null: skipped)
  const givenUp = new Set<number>();                       // tickets passed over because they took too long
  let timer: unknown = null;

  // Use every answer whose turn has come, in order, then (re)start the time limit if something is stuck behind a gap
  function flush() {
    for (;;) {
      if (ready.has(next)) {
        const use = ready.get(next);
        ready.delete(next);
        next++;
        // One answer's trouble must never stop the ones behind it
        try { use?.(); } catch { /* the screen reports its own problems */ }
      } else if (givenUp.has(next)) {
        // Passed over earlier and it still hasn't come in: move on (it is used at once if it ever arrives)
        next++;
      } else {
        break;
      }
    }
    if (ready.size > 0 && timer === null) {
      // Something is waiting behind a missing ticket: give the missing one a time limit
      timer = setTimer(() => {
        timer = null;
        if (ready.size === 0) return;
        if (!ready.has(next)) { givenUp.add(next); next++; }
        flush();
      }, holdLimitMs);
    } else if (ready.size === 0 && timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  return {
    ticket: () => issued++,
    finish(ticket, use) {
      settled++;
      // Too late (it was passed over): use it now rather than lose it
      if (ticket < next) { givenUp.delete(ticket); try { use(); } catch { /* as above */ } return; }
      ready.set(ticket, use);
      flush();
    },
    skip(ticket) {
      settled++;
      if (ticket < next) { givenUp.delete(ticket); return; }
      ready.set(ticket, null);
      flush();
    },
    waiting: () => issued - settled,
  };
}
