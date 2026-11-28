/* =====================================================================
   THE BROWSER'S BACK BUTTON (AND A PHONE'S BACK SWIPE) = THE BACK ARROW
   On the website, the browser's Back button (or a phone's back swipe) moves the browser
   through its own list of pages, which isn't the same list the app's back
   arrow follows (see navHistory.ts): after the arrow has been used, the
   browser's list has extra pages in it. So the swipe could go somewhere the
   arrow wouldn't.
   The fix: after every page change, the browser is given one extra copy of
   the page it's on (same address, marked as ours). The back swipe then only
   removes that copy, which lands on the real page entry with the very same
   address, so nothing moves by itself. We catch that, and:
     - if the back arrow is active: do exactly what tapping it does
       (goBackInApp), then the next page change puts a fresh copy in place
     - if the arrow is greyed out (the first page you opened): nothing
       happens, and a fresh copy is put back, so the swipe doesn't wander
       into pages the arrow doesn't know about
   On every kind of device with a browser: a computer's Back button and a
   phone's back swipe alike. (The browser's Forward button then has nowhere
   to go, the same as the app, which has no forward arrow.) Does nothing in
   the phone app, where Android's own Back is handled by the screens (see search.tsx).
   Plain TypeScript with no React in it.
   ===================================================================== */

import { Platform } from 'react-native';
import { canGoBackInApp, goBackInApp } from './navHistory';

// The mark on the extra copies of a page that we put in the browser's list
const MARK = '__wubrgrGuard';

let installed = false;

// When the page's own code (the router) last moved or changed the browser's list of pages. A back
// press or swipe is done by the browser itself, with no code involved, which is how the two are told apart.
let scriptedAt = 0;
const SETTLE_MS = 350;

// Is the browser sitting on one of our extra copies?
function onCopy(): boolean {
  return Boolean(window.history.state && window.history.state[MARK]);
}

// Put an extra copy of the current page on top of the browser's list (if there isn't one already),
// once the router has finished moving things about. The copy keeps the page's own saved details
// (the router's), so the router isn't confused by it.
export function armBackSwipe(): void {
  if (Platform.OS !== 'web' || !installed) return;
  const sinceMove = Date.now() - scriptedAt;
  if (sinceMove < SETTLE_MS) { setTimeout(armBackSwipe, SETTLE_MS - sinceMove + 20); return; }
  if (onCopy()) return;
  const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.pushState({ ...state, [MARK]: true }, '', window.location.href);
}

// Start listening for the browser's Back (once)
export function installBackSwipe(): void {
  if (Platform.OS !== 'web' || installed || typeof window === 'undefined') return;
  installed = true;
  // Note every time the page's own code moves through the browser's list (the router does, to keep
  // it in step with its screens): those moves aren't swipes
  for (const method of ['go', 'back', 'forward', 'pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history) as (...args: unknown[]) => void;
    (window.history as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => { scriptedAt = Date.now(); original(...args); };
  }
  // "capture" so this hears the back swipe before the router does, and can keep it from acting on it
  window.addEventListener('popstate', (event) => {
    // Moved by the page's own code (the router), or landed on one of our copies (going forward, say):
    // leave it to the router
    if (Date.now() - scriptedAt < SETTLE_MS) return;
    if (event.state && event.state[MARK]) return;
    event.stopImmediatePropagation();
    if (canGoBackInApp()) goBackInApp();   // the same as the back arrow (the next page change re-arms)
    else window.history.pushState({ ...(event.state ?? {}), [MARK]: true }, '', window.location.href);   // the arrow is greyed out: stay put
  }, true);
  // A copy for the page we're on now
  setTimeout(armBackSwipe, 0);
}
