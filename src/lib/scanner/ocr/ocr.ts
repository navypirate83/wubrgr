/* =====================================================================
   READING TEXT FROM A CARD PHOTO: WHAT THE PLATFORMS MUST PROVIDE
   The real versions are ocr.web.ts (the website: Tesseract.js in a web worker,
   reading a full-size photo taken when you tap) and ocr.native.ts (Android:
   Google's ML Kit, reading live camera frames). The app picks the right one by
   its file ending when it's built, so each platform only bundles its own. THIS
   file is never used when the app runs: it gives TypeScript the one thing both
   share, and refuses if it's ever used by mistake. (How a picture gets in is
   different on each platform, so the camera files call their own ocr file for
   that; see ScannerCamera.web.tsx and ScannerCamera.native.tsx.)
   ===================================================================== */

export interface CardOcr {
  // Get the text reader ready (the web version loads it; takes a few seconds the first time)
  warmUp(): Promise<void>;
}

const wrongPlatform = (): never => {
  throw new Error('The text reader for this platform is missing (see ocr.web.ts and ocr.native.ts)');
};

export const cardOcr: CardOcr = { warmUp: wrongPlatform };
