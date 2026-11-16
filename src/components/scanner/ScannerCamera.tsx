/* =====================================================================
   THE SCANNER CAMERA: WHAT THE PLATFORMS MUST PROVIDE
   The real ones are ScannerCamera.web.tsx (the website) and
   ScannerCamera.native.tsx (Android). The app picks the right one by its file
   ending when it's built, so each platform only bundles its own. THIS file is
   never used when the app runs: it only gives TypeScript the shape both have.
   ===================================================================== */

import type { ScannerCameraProps } from './scannerCameraTypes';

export default function ScannerCamera(_props: ScannerCameraProps): null {
  throw new Error('The scanner camera for this platform is missing (see ScannerCamera.web.tsx and ScannerCamera.native.tsx)');
}
