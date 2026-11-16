/* =====================================================================
   READING TEXT FROM A CARD PHOTO: ANDROID (not built yet)
   This will use Google's ML Kit text recognition on live camera frames
   (see the plan: the Android stages come after the website's). Nothing from
   the web side (Tesseract.js, canvases) is used or imported here.
   ===================================================================== */

import type { CardOcr } from './ocr';

export const cardOcr: CardOcr = {
  async warmUp() {
    throw new Error('Scanning on the phone app is not built yet');
  },
};
