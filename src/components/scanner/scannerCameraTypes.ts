/* =====================================================================
   WHAT EVERY PLATFORM'S SCANNER CAMERA TAKES (shared)
   ScannerCamera.web.tsx (the website: a still taken when you tap) and
   ScannerCamera.native.tsx (Android: live frames) are different inside but
   are used the same way by the scan screen: it hands over a function to call
   with each reading, plus what to show along the bottom, and the camera does
   the rest.
   ===================================================================== */

import type { ReactNode } from 'react';
import type { ScanReading } from '@/lib/scanner/core/scannerTypes';

export type ScannerCameraProps = {
  // Called with the text the camera read from a card each time one is scanned. It may take a moment (it works out
  // the printing). The photo is needed until it has finished, so the camera keeps the photo until then: it waits
  // for the answer before taking the next photo, unless "queue" is on (below)
  // It may answer true when the card was recognised and false when nothing could be read from it: the website's
  // Track mode uses a false to look at the card again by itself (a fresh picture often reads fine).
  onReading: (reading: ScanReading) => void | boolean | Promise<void | boolean>;
  // The scan queue. On: the camera doesn't wait for a card to be worked out before taking the next photo; a few
  // can be worked out at the same time (each photo is kept until its own answer is done), and the camera only
  // holds back when that many are already waiting. Off: one card at a time. (The website's camera never waits for
  // the answer anyway.)
  queue?: boolean;
  // A short line to show instead of the usual hint ("Added Exotic Orchard")
  message?: string;
  // What goes either side of the round scan button along the bottom (the mode choice, the list button)
  bar?: { left?: ReactNode; right?: ReactNode };
  // True while something else is open over the camera: scanning is switched off
  paused?: boolean;
  // Says whether some text read from the title looks like a real card's name; the camera uses it to
  // decide whether to look harder for the name (older frames put it in a different place)
  looksLikeName?: (text: string) => boolean;
};
