/* =====================================================================
   THE CARD PICTURES FOR THE AI: ANDROID
   The AI needs a flat, upright COLOUR picture of the card (630 x 880), so the artwork sits where it expects (the website's version of this is
   aiPhoto.web.ts). The phone's text reader works from grey crops, so this asks the add-on for colour ones (ocr.native.ts: colourPicture). It is
   called only when a card turns out to need the AI and the "AI art matching" option is on (see ScanReading.aiPictures), and gives the best guesses
   first:
     1. When the card was already cut out flat (the scan found it in the photo, see ScannerCameraLive.native.tsx), that file is the card: one picture.
     2. Otherwise the card is looked for in the photo with the same edge-and-shape finder (core/shapeFinder.ts) and cut out flat, as a first try;
        then the box the guide (or a chosen photo's middle) marks out, stretched to the card shape, as a second.
   Anything that goes wrong just leaves that picture out; with no pictures the AI is not used and the scan carries on without it.
   ===================================================================== */

import { canCutOutCards, colourPicture, cutOutCard, finishPhoto, photoSize, wholePhotoGray } from '../ocr/ocr.native';
import { findCardByShape } from '../core/shapeFinder';
import { flatHeight, grayToRgba } from '../core/photoCard';
import { CARD_HEIGHT, CARD_WIDTH } from '../core/modelInput';
import type { Fractions } from '../core/cardInPhoto';
import type { RgbaPicture } from '../core/perspective';

// "path" is the photo (or the cut-out card file); "card" is where the card is in it (shares of the picture); "isFlat" says the file IS the
// card already (a cut-out), so there is nothing to look for
export async function aiCardPicturesNative(path: string, card: Fractions, isFlat: boolean): Promise<RgbaPicture[]> {
  const pictures: RgbaPicture[] = [];
  if (isFlat) {
    const whole = await colourPicture(path, [0, 0, 1, 1], CARD_WIDTH, CARD_HEIGHT);
    if (whole) pictures.push(whole);
    return pictures;
  }
  // The card found in the whole photo and cut out flat
  if (canCutOutCards()) {
    let flatFile: string | null = null;
    try {
      const gray = await wholePhotoGray(path, 640);
      const quad = gray ? findCardByShape(grayToRgba(gray), Math.max(gray.width, gray.height)) : null;
      if (quad) {
        const [width, height] = await photoSize(path);
        flatFile = await cutOutCard(path, quad, flatHeight(quad, { w: width, h: height }));
        const found = flatFile ? await colourPicture(flatFile, [0, 0, 1, 1], CARD_WIDTH, CARD_HEIGHT) : null;
        if (found) pictures.push(found);
      }
    } catch {
      /* no found card: the guide's box is still used below */
    } finally {
      if (flatFile) await finishPhoto(flatFile, true).catch(() => undefined);
    }
  }
  // The guide's box (or the middle of a chosen photo), stretched to the card shape
  const boxed = await colourPicture(path, card, CARD_WIDTH, CARD_HEIGHT);
  if (boxed) pictures.push(boxed);
  return pictures;
}
