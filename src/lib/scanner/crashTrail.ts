/* =====================================================================
   THE CRASH TRAIL (shared by Android and the website)
   A tiny diary of the steps the app reaches. If the app closes by itself, the diary's last
   line shows how far it got, and the next time the Scan screen opens it offers those last
   steps to copy and send (see components/scanner/CrashTrailNotice.tsx).
   HOW IT WORKS
   - mark("step") adds a line (with the time) and saves the whole diary at once, so even
     if the app dies a moment later the line is kept. The newest 30 lines are kept.
   - The very first time anything here is used in a run (even before the Scan screen has drawn
     anything), the diary of the run before is read ON THE SPOT. If it did not end with "clean exit",
     it is kept as a report to show (until dismissed). Then a fresh diary starts.
   - "clean exit" is written when the Scan screen is left, or the app goes to the background.
     A diary ending that way is never reported.
   - SAFE MODE: if the run before stopped (no clean exit) while the camera's code was loading or the camera
     was starting or running, a note is kept ("safe"). The Scan screen then starts with the camera OFF
     and a "Start camera" button. The note is removed again by a clean exit after the camera has really run.
   - THE SIGN-IN DIARY: a second, separate diary (kept across runs) of why the app thought you were signed
     in or out (see lib/session.ts). It is added under the report you copy, so a "logged out" mystery can be traced.
   - Every function here is safe: none of them ever throws or makes the caller wait.
   The plain sums are in core/crashTrailCore.ts, with tests; where it's kept is crashTrailStore.native.ts / .web.ts.
   ===================================================================== */

import { AppState } from 'react-native';
import { CLEAN_EXIT, addCrumb, cameraWasActive, decodeTrail, encodeTrail, reportText, sessionReportText, wasInterrupted, type Crumb } from './core/crashTrailCore';
import { trailStore } from './crashTrailStore';

// The names the pieces are kept under: the running diary, a report of an interrupted run waiting to be shown,
// the safe-mode note, and the sign-in diary
const TRAIL = 'trail';
const REPORT = 'report';
const SAFE = 'safe';
const SESSION = 'session';
// How many lines the sign-in diary keeps
const SESSION_LINES = 14;

// The diary of this run so far
let trail: Crumb[] = [];
// Has the previous run's diary been read yet? (done once, the first time anything here is used)
let started = false;
// Is safe mode on (the camera must not start by itself)?
let safe = false;
// Has the camera really run in this run? (Only then does a clean exit end safe mode.)
let cameraRan = false;
// The sign-in diary, and whether it has been read from where it is kept
let session: Crumb[] = [];
let sessionRead = false;

// Read the run before, once, on the spot (never throws)
function start() {
  if (started) return;
  started = true;
  try {
    const before = decodeTrail(trailStore.getSync ? trailStore.getSync(TRAIL) : null);
    if (wasInterrupted(before)) trailStore.set(REPORT, encodeTrail(before));
    safe = cameraWasActive(before) || (trailStore.getSync ? trailStore.getSync(SAFE) !== null : false);
    if (safe) trailStore.set(SAFE, '1');
    // The old diary has been dealt with: forget it, so a dismissed report can't come back at the next start
    trailStore.remove(TRAIL);
  } catch {
    /* the diary is only a help */
  }
  try {
    // Going to the background is a normal exit (coming back is marked by the Scan screen, which knows it is looking)
    AppState.addEventListener('change', (state) => { if (state !== 'active') markCleanExit(); });
  } catch {
    /* no app-state watching then */
  }
}

// Save the whole diary now (never throws)
function save() {
  try { trailStore.set(TRAIL, encodeTrail(trail)); } catch { /* the diary is only a help */ }
}

// Write down that a step was reached
export function mark(step: string): void {
  try {
    start();
    trail = addCrumb(trail, step, Date.now());
    save();
  } catch {
    /* the diary is only a help */
  }
}

// The camera has really started running: remember it, so a clean exit afterwards ends safe mode
export function markCameraRunning(): void {
  cameraRan = true;
  mark('camera running');
}

// Write the "clean exit" line (the Scan screen was left, or the app went to the background). Not written twice in a
// row. If the camera has really run during this run, safe mode ends here.
export function markCleanExit(): void {
  try {
    start();
    if (trail.length === 0 || trail[trail.length - 1].s !== CLEAN_EXIT) mark(CLEAN_EXIT);
    if (cameraRan && safe) {
      safe = false;
      trailStore.remove(SAFE);
    }
  } catch {
    /* the diary is only a help */
  }
}

// Should the Scan screen start with the camera off? (The run before stopped while the camera was starting.)
export function isSafeMode(): boolean {
  try { start(); return safe; } catch { return false; }
}

// The Scan screen has opened. Gives the report of an interrupted earlier run that has not been dismissed yet, or null.
// (It does NOT start a new diary: that already started with the first step, which may be from before this screen opened.)
export function beginRun(): Promise<Crumb[] | null> {
  start();
  return (async () => {
    try {
      const waiting = decodeTrail(await trailStore.get(REPORT));
      return waiting.length ? waiting : null;
    } catch {
      return null;
    }
  })();
}

// The steps of an interrupted earlier run as text to copy ('' when there is none). Never throws.
export async function previousTrailText(): Promise<string> {
  try {
    start();
    const waiting = decodeTrail(await trailStore.get(REPORT));
    return waiting.length ? reportText(waiting) : '';
  } catch {
    return '';
  }
}

// The Scan screen was closed: the last line is the clean exit
export function endRun(): void {
  markCleanExit();
}

// The report was dismissed (or copied and dismissed): forget it
export function clearReport(): void {
  try { trailStore.remove(REPORT); } catch { /* nothing to forget */ }
}

/* ----- the sign-in diary ----- */

// Read the sign-in diary from where it is kept, once
function readSession() {
  if (sessionRead) return;
  sessionRead = true;
  try { session = decodeTrail(trailStore.getSync ? trailStore.getSync(SESSION) : null); } catch { session = []; }
}

// Write down a sign-in step ("session restore: restored"). Kept across runs. Never throws.
export function markSession(step: string): void {
  try {
    readSession();
    // The same note twice in a row (a failing network trying again and again) is written once
    if (session.length && session[session.length - 1].s === step.slice(0, 80)) return;
    session = addCrumb(session, step, Date.now(), SESSION_LINES);
    trailStore.set(SESSION, encodeTrail(session));
  } catch {
    /* the diary is only a help */
  }
}

// The sign-in diary as text to put under a report ('' when it is empty). Never throws.
export function sessionText(): string {
  try { readSession(); return sessionReportText(session); } catch { return ''; }
}

// (CLEAN_EXIT is re-exported so screens can compare with it without reaching into core)
export { CLEAN_EXIT };
