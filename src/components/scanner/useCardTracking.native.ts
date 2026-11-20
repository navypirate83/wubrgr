/* =====================================================================
   TRACK CARD FOR THE ANDROID SCANNER (this file is only ever used on the phone, never the website)
   The website's scanner has a "Track card" mode: no lining up, the card is found wherever it is in the live picture, an
   outline is drawn round it, and it is scanned by itself once it has held still (see ScannerCamera.web.tsx). This is the
   same thing for the phone app, with the same rules and the same numbers.

   HOW IT LOOKS AT THE LIVE PICTURE
   A few times a second it asks the camera view for a "snapshot": a copy of exactly what is on the screen right now (the
   camera library's takeSnapshot). That copy is shrunk to 320 pixels wide, its pixels are handed to the app, and the very
   same card finders the website uses (core/shapeFinder.ts, then core/cardFinder.ts) look for the card in it. Because the
   snapshot IS the screen picture, a corner found at "30% across, 40% down" is at that same place on the screen, which is
   where the outline is drawn. No text is read here, so it is cheap; the real reading happens once, from a full photo, when
   the card has held still (the camera screen does that: see scanTracked in ScannerCameraLive.native.tsx).

   WHEN A CARD IS SCANNED (the same rules as the website)
     - the card must be seen on two looks before it counts (core/tracker.ts), and is kept through a few missed looks;
     - it must hold still for 0.7 seconds;
     - after a scan it is not scanned again until it is taken away, moved well away, or a DIFFERENT card is put in its
       place (its tiny signature has clearly changed and then held steady);
     - a scan that read nothing is tried again by itself a few times.

   NEW, NOT YET TRIED ON A PHONE. If the snapshot cannot be had many times in a row, onBroken is called and the camera
   screen switches Track off with a short message, so the scanner is never left stuck.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { CameraRef } from 'react-native-vision-camera';
import { findCardByShape } from '@/lib/scanner/core/shapeFinder';
import { blendQuads, findCard, quadCentre, quadShift } from '@/lib/scanner/core/cardFinder';
import { Tracker } from '@/lib/scanner/core/tracker';
import { changedFrame, signatureDifference, tinyFromRgba } from '@/lib/scanner/core/frameChange';
import type { Point, Quad, RgbaPicture } from '@/lib/scanner/core/perspective';
import { mark } from '@/lib/scanner/crashTrail';

// The same numbers as the website's Track mode (see ScannerCamera.web.tsx for what each one is)
const LOOK_WIDTH = 320;
const HOLD_STILL_MS = 700;
const STILL_DRIFT = 0.015;
const GONE_LOOKS = 8;
const MAX_RETRIES = 3;
const RETRY_AFTER_MS = 1200;
const CHANGE_LOOKS = 3;
const STEADY_BELOW = 0.06;
// The rest between one look and the next (each look also takes its own time, which the website's timer does not wait for)
const LOOK_PAUSE_MS = 60;
// This many looks in a row with no snapshot, and Track is given up on (about 5 seconds: the camera may just be starting)
const MAX_FAILED_LOOKS = 15;
const FAILED_LOOK_PAUSE_MS = 300;

// What Track currently sees: the card's corners (as shares of the camera area on the screen), how far through the
// hold-still wait it is (0 to 1), and whether it will be scanned when the wait is over
export type SeenCard = { quad: Quad; hold: number; armed: boolean };

export type CardTracking = {
  // The card being followed right now (null: none)
  seen: SeenCard | null;
  // Start afresh: the next card that holds still is scanned (used when Track is switched on)
  reset(): void;
  // Note that the card at these corners is being scanned now, so it is not scanned again until it changes
  // (used when the round button scans the followed card)
  noteScanned(quad: Quad): void;
  // Tell Track how the scan came out (true: read; false: nothing could be read, so it looks again by itself a few times)
  noteAnswer(read: boolean | void): void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Find the card in a small look: first by its edges and shape, and if that finds nothing, by its colour against the table
// (the same order as the website)
function findCardInLook(look: RgbaPicture): Quad | null {
  try {
    const byShape = findCardByShape(look, look.width);
    if (byShape) return byShape;
  } catch { /* the shape finder failing only means the colour finder is used */ }
  try { return findCard(look); } catch { return null; }
}

// The pixels the phone hands over, as red, green, blue, opacity for each pixel (what the finders take). Android gives them
// in that order already; the other orders the picture library can give are put right here. Null for one it cannot use.
function toRgba(buffer: ArrayBuffer, width: number, height: number, format: string): RgbaPicture | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < width * height * 4) return null;
  if (format === 'RGBA' || format === 'RGBX') return { data: bytes, width, height };
  // Where red, green and blue sit inside each pixel's four bytes
  const order: Record<string, [number, number, number]> = { BGRA: [2, 1, 0], BGRX: [2, 1, 0], ARGB: [1, 2, 3], XRGB: [1, 2, 3], ABGR: [3, 2, 1], XBGR: [3, 2, 1] };
  const at = order[format];
  if (!at) return null;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height * 4; i += 4) {
    data[i] = bytes[i + at[0]];
    data[i + 1] = bytes[i + at[1]];
    data[i + 2] = bytes[i + at[2]];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

// "on": Track is switched on and the camera is running. "camera": the camera view. "isBlocked": true while the camera
// screen is busy (reading a card, something open over it), when no looks are taken. "onHeldStill": a card has held still
// and should be scanned. "onBroken": the snapshots keep failing, so Track cannot work here.
export function useCardTracking(options: {
  on: boolean;
  camera: RefObject<CameraRef | null>;
  isBlocked: () => boolean;
  onHeldStill: (quad: Quad) => void;
  onBroken: (why: string) => void;
}): CardTracking {
  const { on, camera } = options;
  const [seen, setSeen] = useState<SeenCard | null>(null);
  // The loop below lives on past renders, so it reads the newest versions of what it was given through this note-to-self
  const latest = useRef(options);
  latest.current = options;
  // What has been scanned: "armed" is true until a card has been scanned, and again once it has gone or changed;
  // "scannedAt" is where that card's middle was; "scannedSig" is its tiny signature; "retries" counts the looks-again
  const state = useRef({ armed: true, scannedAt: null as Point | null, scannedSig: null as Uint8Array | null, retries: 0, on });
  state.current.on = on;
  // The signature of the card on the newest look (kept so noteScanned can remember what the scanned card looked like)
  const newestSig = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!on) { setSeen(null); return; }
    let stop = false;
    mark('track card on');
    (async () => {
      let last: Quad | null = null;            // where the card was last time (smoothed)
      let stillSince = 0;                      // when it last stopped moving
      let missing = 0;                         // how many looks in a row found no card
      let changedLooks = 0;                    // looks in a row the scanned card's picture has clearly changed and held steady
      let lastSig: Uint8Array | null = null;   // the card's tiny signature on the look before this one
      let failed = 0;                          // looks in a row with no snapshot
      let firstLook = true;
      const tracker = new Tracker();
      while (!stop) {
        if (latest.current.isBlocked()) { await sleep(150); continue; }
        // ----- one look: a snapshot of the screen picture, shrunk, as pixels -----
        let look: RgbaPicture | null = null;
        let why = 'no snapshot';
        try {
          const view = camera.current;
          if (view) {
            const snapshot = await view.takeSnapshot();
            try {
              const height = Math.max(1, Math.round((LOOK_WIDTH * snapshot.height) / snapshot.width));
              const small = await snapshot.resizeAsync(LOOK_WIDTH, height);
              try {
                const raw = await small.toRawPixelDataAsync(false);
                look = toRgba(raw.buffer, raw.width, raw.height, String(raw.pixelFormat));
                if (!look) why = `pixels in an order that is not known (${String(raw.pixelFormat)})`;
              } finally {
                try { small.dispose(); } catch { /* already let go */ }
              }
            } finally {
              try { snapshot.dispose(); } catch { /* already let go */ }
            }
          }
        } catch (err) {
          why = (err as Error).message || why;
        }
        if (stop) return;
        if (!look) {
          failed += 1;
          if (failed >= MAX_FAILED_LOOKS) {
            mark(`track card given up: ${why}`);
            latest.current.onBroken(why);
            return;
          }
          await sleep(FAILED_LOOK_PAUSE_MS);
          continue;
        }
        failed = 0;
        if (firstLook) { firstLook = false; mark(`track card looking (${look.width} x ${look.height})`); }

        // ----- the same steps as the website's Track mode, from here -----
        const looked = findCardInLook(look);
        tracker.update(looked ? [{ quad: looked, score: 1 }] : []);
        // The card being followed (null while it has only been seen once, or was missed this look)
        const quad = tracker.activeTrack()?.quad ?? null;
        const now = Date.now();
        const s = state.current;
        if (!quad) {
          // No card: the tracker forgets it only after a few missed looks in a row, so the outline holds through one bad look
          missing += 1;
          if (!tracker.tracks.length) { last = null; stillSince = 0; setSeen(null); }
          if (missing >= GONE_LOOKS) { s.armed = true; s.retries = 0; }
          lastSig = null;
          newestSig.current = null;
          changedLooks = 0;
        } else {
          missing = 0;
          // Moving a lot: the hold-still wait starts again (and a card moved well away from where it was scanned counts as a new card)
          const moved = last ? quadShift(last, quad) : 1;
          if (!stillSince || moved > STILL_DRIFT) stillSince = now;
          const centre = quadCentre(quad);
          if (s.scannedAt && Math.hypot(centre.x - s.scannedAt.x, centre.y - s.scannedAt.y) > 0.2) { s.armed = true; s.retries = 0; }
          const smooth: Quad = last ? blendQuads(last, quad, 0.4) : quad;
          last = smooth;
          const hold = Math.min(1, (now - stillSince) / HOLD_STILL_MS);
          // The card's tiny signature (a box round the card, squeezed to a small grid): used to notice a DIFFERENT card put
          // down where the scanned one was, without it leaving first
          const xs = smooth.map((p) => p.x);
          const ys = smooth.map((p) => p.y);
          const sig = tinyFromRgba(look.data, look.width, look.height, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
          if (!s.armed && s.scannedSig) {
            // Clearly different from the card that was scanned, and the same as a moment ago (so not mid-move): a new card
            const different = changedFrame(s.scannedSig, sig) && !!lastSig && signatureDifference(lastSig, sig) < STEADY_BELOW;
            changedLooks = different ? changedLooks + 1 : 0;
            if (changedLooks >= CHANGE_LOOKS) { s.armed = true; s.retries = 0; changedLooks = 0; }
          }
          lastSig = sig;
          newestSig.current = sig;
          setSeen({ quad: smooth, hold, armed: s.armed });
          if (hold >= 1 && s.armed) {
            // Until this card leaves, moves or changes, it is not scanned again; remember what it looked like
            s.armed = false;
            s.scannedAt = centre;
            s.scannedSig = sig;
            latest.current.onHeldStill(smooth);
          }
        }
        await sleep(LOOK_PAUSE_MS);
      }
    })();
    return () => { stop = true; };
  }, [on, camera]);

  const reset = useCallback(() => {
    state.current = { ...state.current, armed: true, scannedAt: null, scannedSig: null, retries: 0 };
  }, []);

  const noteScanned = useCallback((quad: Quad) => {
    const s = state.current;
    s.armed = false;
    s.scannedAt = quadCentre(quad);
    s.scannedSig = newestSig.current;
  }, []);

  const noteAnswer = useCallback((read: boolean | void) => {
    const s = state.current;
    if (read === true) { s.retries = 0; return; }
    if (read === false && s.on && s.retries < MAX_RETRIES) {
      s.retries += 1;
      // A fresh picture often reads fine: look at the same card again after a short wait
      setTimeout(() => { if (state.current.on) { state.current.armed = true; state.current.scannedSig = null; } }, RETRY_AFTER_MS);
    }
  }, []);

  return useMemo(() => ({ seen, reset, noteScanned, noteAnswer }), [seen, reset, noteScanned, noteAnswer]);
}
