/* =====================================================================
   THE CRASH TRAIL: THE PLAIN SUMS (shared, plain TypeScript, no imports)
   When the phone app closes by itself (a "crash"), it can't tell anyone why. So the
   scanner keeps a short diary of the steps it reached ("scan screen mounted",
   "camera mounted", "photo taken" ...). The next time the Scan screen opens, the diary
   is read: if it does NOT end with "clean exit" (a note written when the Scan screen is
   left normally, or the app goes to the background), the scanner stopped in the middle
   of something, and the last few steps show where.
   This file has only the parts that are pure sums on text and lists (so they can be
   checked by tests); where the diary is kept is in crashTrail.ts.
   ===================================================================== */

// One diary line: when it happened (a clock number, in milliseconds) and what step it was
export type Crumb = { t: number; s: string };

// How many lines the diary keeps (the newest ones; older ones are dropped)
export const MAX_CRUMBS = 30;
// The longest a step's words may be (so a stray long message can't fill the storage)
const MAX_STEP_LENGTH = 80;
// The line written when the Scan screen is left normally or the app goes to the background
export const CLEAN_EXIT = 'clean exit';

// The diary with one more line at the end, keeping only the newest "max" lines. Gives a new list;
// the old one is left as it was.
export function addCrumb(list: Crumb[], step: string, now: number, max: number = MAX_CRUMBS): Crumb[] {
  const next = [...list, { t: now, s: String(step).slice(0, MAX_STEP_LENGTH) }];
  return next.length > max ? next.slice(next.length - max) : next;
}

// The diary turned into text for keeping
export function encodeTrail(list: Crumb[]): string {
  return JSON.stringify(list);
}

// Text turned back into a diary. Never throws: anything that isn't a proper diary
// (nothing saved, damaged text) gives an empty one, and lines that don't look right are left out.
export function decodeTrail(text: string | null | undefined): Crumb[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const good: Crumb[] = [];
    for (const line of parsed) {
      if (line && typeof line === 'object' && typeof (line as Crumb).t === 'number' && typeof (line as Crumb).s === 'string') {
        good.push({ t: (line as Crumb).t, s: (line as Crumb).s.slice(0, MAX_STEP_LENGTH) });
      }
    }
    return good.slice(-MAX_CRUMBS);
  } catch {
    return [];
  }
}

// Did the last run stop in the middle of something? Yes when there is a diary and it does not end with the clean-exit line.
// (No diary at all means the Scan screen has never been opened, which is not a problem.)
export function wasInterrupted(list: Crumb[]): boolean {
  return list.length > 0 && list[list.length - 1].s !== CLEAN_EXIT;
}

// The last few steps (oldest first)
export function lastSteps(list: Crumb[], count: number): Crumb[] {
  return count <= 0 ? [] : list.slice(-count);
}

// The last few steps as one line of words for the message on the screen: "a, then b, then c"
export function stepsInWords(list: Crumb[], count: number = 4): string {
  const steps = lastSteps(list, count).map((line) => line.s);
  return steps.length ? steps.join(', then ') : 'none';
}

// The whole diary as plain text to copy and send: one line per step with its date and time
// (in the world-wide clock, so it reads the same wherever it is sent)
export function reportText(list: Crumb[]): string {
  const lines = list.map((line) => {
    const when = Number.isFinite(line.t) ? new Date(line.t).toISOString().replace('T', ' ').slice(0, 19) : '?';
    return `${when} UTC  ${line.s}`;
  });
  return ["WUBRG'r scanner did not close properly. Steps reached (oldest first):", ...lines].join('\n');
}
