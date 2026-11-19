/* =====================================================================
   WARMING THE SCANNER UP (shared by Android and the website)
   When the Scan screen opens, this gets everything the first scan would
   otherwise have to wait for ready, in the background, one piece at a time:
     1. the text reader (the website: its Tesseract workers; Android: Google's
        reader, with one tiny practice read if this build of the add-on can do it);
     2. the set-code list and the card-name list (kept in memory after this);
     3. only if "AI art matching" is on and this account may use it: the AI
        fingerprints, the model, and one practice run of the model.
   The catalogue itself is opened by the scan screen just before this starts.
   It is built to be invisible: nothing is shown on the screen, it never
   throws (a step that fails is skipped; the scan will then do that step
   itself, as it did before there was a warm-up), it gives the screen a turn
   between steps, and it can be cancelled when the screen closes.
   How long each step took is kept in lastWarmTimings() for measuring later.
   The order and the safety are in core/warmPlan.ts (which has tests).
   ===================================================================== */

import { cardOcr } from './ocr/ocr';
import { warmAi } from './ai/aiRun';
import { warmResolve } from './scanResolve';
import { runWarmSteps, type WarmResult, type WarmStep } from './core/warmPlan';

// What the last warm-up did (how long each step took, which failed), for measuring
let last: WarmResult | null = null;
export const lastWarmTimings = (): WarmResult | null => last;

// A running warm-up: stop it, or wait for it to finish (it never fails)
export type WarmUp = { cancel(): void; done: Promise<WarmResult> };

// Start warming up. "ai" says whether the AI option is on right now.
export function startWarmUp(ai: boolean): WarmUp {
  let cancelled = false;
  const isCancelled = () => cancelled;
  const steps: WarmStep[] = [
    { name: 'reader', run: () => cardOcr.warmUp() },
    { name: 'names', run: () => warmResolve() },
  ];
  if (ai) steps.push({ name: 'ai', run: () => warmAi(isCancelled) });
  const done = runWarmSteps(steps, isCancelled).then((result) => { last = result; return result; })
    // (runWarmSteps never throws, but nothing here may ever surface an error to the person)
    .catch((): WarmResult => ({ timings: {}, failed: ['all'], cancelled }));
  return { cancel: () => { cancelled = true; }, done };
}
