/* =====================================================================
   THE CARD PICTURES FOR THE AI: THE WEBSITE
   The AI needs a flat, upright picture of the card, so that the artwork sits
   where it expects. The text reader does fine with the rough crop the camera
   makes, so that stays as it is. This makes the extra pictures just for the AI,
   and only when the "AI art matching" option is on and a card turns out to need
   them (see ScanReading.aiPictures):
     1. The photo is copied smaller (no more than 1600 pixels on its long side)
        so the search stays quick, and the "outline" card finder
        (core/outlineFinder.ts) looks for a card-shaped rectangle with a firm edge
        all the way round, even on a busy table or in a hand.
     2. Each place it found (the best one, and a clearly larger one, since a card's
        inner boxes also have edges) is straightened into a flat 630 x 880 picture.
     3. The camera's own crop of the card is added as one more try (in case the
        finder found nothing, or the card was already straightened).
   The AI then looks at all of them and goes with the most convincing one.
   Step 1 and 2's search runs in a background worker when the browser allows it (aiWorker.web.ts), so the page does
   not freeze for it; if that is not possible it runs right here, as before.
   When the card is already filling the whole picture (Track mode's straightened
   card, or a photo that is only the card) the search is skipped: there is nothing
   to find.
   ===================================================================== */

import { findOutlines, flatCard } from '../core/outlineFinder.ts';
import type { RgbaPicture } from '../core/perspective.ts';
import { outlinePicturesInWorker } from './aiWorker.web';

// The longest side the working copy of the photo may have
const WORK_SIZE = 1600;
// The size of the flat card picture made from the camera's own crop (the finder's pictures are 630 x 880)
const CROP_HEIGHT = 880;

// Where the card is in the photo, in the photo's own pixels
type CardRect = { x: number; y: number; w: number; h: number };

// "source" is the photo (a canvas); "card" is where the camera thinks the card is
export async function aiCardPictures(source: HTMLCanvasElement, card: CardRect): Promise<RgbaPicture[]> {
  const pictures: RgbaPicture[] = [];
  const alreadyFlat = card.w >= source.width * 0.97 && card.h >= source.height * 0.97;

  // 1 and 2: the outline finder, on a smaller copy of the whole photo
  if (!alreadyFlat) {
    try {
      const scale = Math.min(1, WORK_SIZE / Math.max(source.width, source.height));
      const work = document.createElement('canvas');
      work.width = Math.max(1, Math.round(source.width * scale));
      work.height = Math.max(1, Math.round(source.height * scale));
      const workContext = work.getContext('2d', { willReadFrequently: true })!;
      workContext.imageSmoothingQuality = 'high';
      workContext.drawImage(source, 0, 0, work.width, work.height);
      const photo = workContext.getImageData(0, 0, work.width, work.height);
      // The search is a lot of number-crunching, so it is done in a background worker (see aiWorker.web.ts) and the
      // page stays smooth. The photo's pixels are handed to the worker (the page can't use them afterwards).
      const fromWorker = await outlinePicturesInWorker(photo.data.buffer as ArrayBuffer, photo.width, photo.height);
      if (fromWorker) {
        pictures.push(...fromWorker);
      } else {
        // No worker (or it failed): search on the page itself, as it always did. If the pixels were already handed
        // to the worker, they are taken from the working copy again.
        const again = photo.data.buffer.byteLength > 0 ? photo : workContext.getImageData(0, 0, work.width, work.height);
        for (const found of findOutlines(again)) pictures.push(flatCard(again, found));
      }
    } catch {
      /* the finder failing only means the camera's own crop is used */
    }
  }

  // 3: the camera's own crop, made upright-sized (stretched to the card's shape if it is a little off)
  const crop = document.createElement('canvas');
  crop.height = CROP_HEIGHT;
  crop.width = Math.round(CROP_HEIGHT * 0.716);
  const cropContext = crop.getContext('2d', { willReadFrequently: true })!;
  cropContext.imageSmoothingQuality = 'high';
  cropContext.drawImage(source, card.x, card.y, card.w, card.h, 0, 0, crop.width, crop.height);
  pictures.push(cropContext.getImageData(0, 0, crop.width, crop.height));
  return pictures;
}
