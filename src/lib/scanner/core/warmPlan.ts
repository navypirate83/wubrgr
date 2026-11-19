/* =====================================================================
   GETTING READY BEFORE THE FIRST SCAN (shared, plain TypeScript, no imports)
   The first scan after opening the Scan screen used to pay for a lot of
   one-off set-up: loading the card names, the text reader, and (with AI art
   matching on) the AI files. "Warming up" does that set-up in the background as
   soon as the screen opens, so the first scan is as quick as the later ones.
   This file only runs a list of set-up steps, one after another, with these
   promises:
   - it never throws: a step that fails is written down and the next one runs
     (a scan will report the problem itself if it really needs that step);
   - it can be cancelled at any time (the screen closing): the step being run
     finishes, but no later step starts;
   - it gives the screen a turn between steps, so nothing freezes;
   - it shows nothing: it only returns how long each step took.
   ===================================================================== */

// One set-up step: a name (for the timings) and the work
export type WarmStep = { name: string; run: () => Promise<unknown> };

// What happened: how long each step that ran took (ms), the steps that failed, and whether it was cancelled part way
export type WarmResult = { timings: Record<string, number>; failed: string[]; cancelled: boolean };

// Run the steps in order. "isCancelled" is asked before each step; "pause" gives the screen a turn between
// steps; "now" is the clock (the last two can be pretend ones in tests).
export async function runWarmSteps(
  steps: WarmStep[],
  isCancelled: () => boolean,
  pause: () => Promise<void> = () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  now: () => number = () => Date.now(),
): Promise<WarmResult> {
  const result: WarmResult = { timings: {}, failed: [], cancelled: false };
  for (const step of steps) {
    if (isCancelled()) { result.cancelled = true; break; }
    const started = now();
    try {
      await step.run();
    } catch {
      result.failed.push(step.name);
    }
    result.timings[step.name] = now() - started;
    try { await pause(); } catch { /* a failing pause must not stop the set-up */ }
  }
  return result;
}
