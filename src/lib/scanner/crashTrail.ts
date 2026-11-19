/* =====================================================================
   THE CRASH TRAIL (shared by Android and the website)
   A tiny diary of the steps the scanner reaches. If the app closes by itself, the
   diary's last line shows how far it got, and the next time the Scan screen opens it
   offers those last steps to copy and send (see components/scanner/CrashTrailNotice.tsx).
   HOW IT WORKS
   - mark("step") adds a line (with the time) and saves the whole diary at once, so even
     if the app dies a moment later the line is kept. The newest 30 lines are kept.
   - beginRun() is called when the Scan screen opens. It reads the diary of the run before: if that did not end
     with "clean exit", it is kept as a report to show (until it is dismissed). Then a fresh diary starts.
   - endRun() / markCleanExit() write the "clean exit" line: the Scan screen was left, or the app went
     to the background. A diary ending that way is never reported.
   - Every function here is safe: none of them ever throws or makes the caller wait, so
     putting one anywhere in the scanner can't make it worse.
   The plain sums (adding a line, reading the saved text, deciding "interrupted") are in
   core/crashTrailCore.ts, with tests; where it's kept is crashTrailStore.native.ts / .web.ts.
   ===================================================================== */

import { CLEAN_EXIT, addCrumb, decodeTrail, encodeTrail, wasInterrupted, type Crumb } from './core/crashTrailCore';
import { trailStore } from './crashTrailStore';

// The names the two pieces are kept under: the running diary, and a report of an interrupted run waiting to be shown
const TRAIL = 'trail';
const REPORT = 'report';

// The diary of this run so far. "loaded" is false only for the first moments of a run, while the
// previous run's diary is being read: nothing is saved until then, so it can't be written over.
let trail: Crumb[] = [];
let loaded = true;
// Which call of beginRun is the newest (an older one must not touch the state)
let runNumber = 0;

// Save the whole diary now (never throws)
function save() {
  try { trailStore.set(TRAIL, encodeTrail(trail)); } catch { /* the diary is only a help */ }
}

// Write down that a step was reached
export function mark(step: string): void {
  try {
    trail = addCrumb(trail, step, Date.now());
    if (loaded) save();
  } catch {
    /* the diary is only a help */
  }
}

// Write the "clean exit" line (the Scan screen was left, or the app went to the background)
export function markCleanExit(): void {
  mark(CLEAN_EXIT);
}

// Start a new run (the Scan screen has opened). Gives the report of an interrupted earlier run
// that has not been dismissed yet, or null. Never throws.
export function beginRun(): Promise<Crumb[] | null> {
  runNumber += 1;
  const mine = runNumber;
  trail = [];
  loaded = false;
  return (async () => {
    let report: Crumb[] | null = null;
    try {
      const before = decodeTrail(await trailStore.get(TRAIL));
      if (wasInterrupted(before)) trailStore.set(REPORT, encodeTrail(before));
      const waiting = decodeTrail(await trailStore.get(REPORT));
      report = waiting.length ? waiting : null;
    } catch {
      /* no report then */
    }
    // Only the newest run goes on: it now saves what it collected while the old diary was being read
    if (mine === runNumber) {
      loaded = true;
      save();
    }
    return report;
  })();
}

// The Scan screen was closed: the last line is the clean exit
export function endRun(): void {
  markCleanExit();
}

// The report was dismissed (or copied and dismissed): forget it
export function clearReport(): void {
  try { trailStore.remove(REPORT); } catch { /* nothing to forget */ }
}

// (CLEAN_EXIT is re-exported so screens can compare with it without reaching into core)
export { CLEAN_EXIT };
