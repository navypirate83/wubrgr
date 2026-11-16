/* =====================================================================
   WHAT EVERY PLATFORM'S SCANNER CAMERA TAKES (shared)
   ScannerCamera.web.tsx (the website: a still taken when you tap) and
   ScannerCamera.native.tsx (Android: live frames) are different inside but
   are used the same way by the scan screen: it hands over a function to call
   with each reading, and the camera does the rest.
   ===================================================================== */

import type { ScanReading } from '@/lib/scanner/core/scannerTypes';

export type ScannerCameraProps = {
  // Called with the text the camera read from a card each time one is scanned
  onReading: (reading: ScanReading) => void;
};
