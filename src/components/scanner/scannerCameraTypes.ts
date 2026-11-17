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
  // the printing); the camera waits for it, because the photo is needed until then
  onReading: (reading: ScanReading) => void | Promise<void>;
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
