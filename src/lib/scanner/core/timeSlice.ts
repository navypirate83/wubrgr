/* =====================================================================
   LETTING THE SCREEN AND CAMERA TAKE TURNS (shared, plain TypeScript, no imports)
   The phone and the website run the app's JavaScript on ONE line of work. A long
   stretch of calculation (like matching a card name against 30,000 names) holds
   that line, so the camera loop and the screen cannot move until it is done. The
   fix is to do long work in small slices: after about a dozen milliseconds of
   work, pause for a moment so anything else waiting (the next camera look, a
   button press, drawing the screen) gets its turn, then carry on.
   "makeBreather" gives back a function to call now and then inside long work:
   "await breathe()". Most calls cost almost nothing (it only checks the clock);
   once a slice has been used up, it really pauses.
   ===================================================================== */

// "now" and "pause" can be swapped for pretend ones (the tests do), otherwise the real clock and a zero-length timer
export function makeBreather(
  sliceMs = 12,
  now: () => number = () => Date.now(),
  pause: () => Promise<void> = () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
): () => Promise<void> {
  let sliceStart = now();
  return async () => {
    if (now() - sliceStart < sliceMs) return;
    await pause();
    sliceStart = now();
  };
}
