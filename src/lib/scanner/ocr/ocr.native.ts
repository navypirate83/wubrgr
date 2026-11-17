/* =====================================================================
   READING TEXT FROM A CARD PHOTO: ANDROID
   Uses Google's ML Kit text reader, through a small add-on of our own
   (modules/card-text-reader, written in Android's own language, Kotlin). ML Kit runs
   on the phone, needs no internet and is much better at small print than the
   website's reader, so the info line, the name and the copyright line are read
   straight from the photo with no clean-up steps first. Nothing from the web
   side (Tesseract.js, canvases) is used or imported here.
   The camera file (ScannerCamera.native.tsx) takes the photo and works out where the
   card is in it; this file turns that into the same ScanReading the website makes,
   including the extra clues for older cards (set symbol, artwork, border colour).
   ===================================================================== */

import { requireNativeModule } from 'expo';
import { ART_BOX, ART_SHIFTS, BORDER_STRIP, CARD_PARTS, NAME_BAND, SYMBOL_BOX, type Box, type ScanExtras, type ScanReading } from '../core/scannerTypes';
import type { Fractions } from '../core/cardInPhoto';
import { borderFromBrightness } from '../core/borderColor';
import { decodeGray, meanBrightness, type PackedGray } from '../core/grayDecode';
import type { CardOcr } from './ocr';

// What the add-on offers (see CardTextReaderModule.kt)
type CardTextReaderModule = {
  // The photo's size once it's turned upright: [width, height]
  photoSize(path: string): Promise<[number, number]>;
  // The text in each part of the card (the parts are shares of the card), in the same order
  readParts(path: string, card: Fractions, parts: Fractions[]): Promise<string[]>;
  // Parts of the card as grey pictures, each no wider than the matching number
  grayCrops(path: string, card: Fractions, parts: Fractions[], maxWidths: number[]): Promise<PackedGray[]>;
  // One part of the card as a small JPEG (packed as text)
  jpegCrop(path: string, card: Fractions, part: Fractions, width: number): Promise<string>;
  // Let go of a photo (and remove its file if the camera took it)
  deletePhoto(path: string, deleteFile: boolean): Promise<void>;
};

// Found the first time it's needed (so a phone app build without the add-on says so clearly, instead of crashing at start-up)
let addOn: CardTextReaderModule | null = null;
function reader(): CardTextReaderModule {
  if (!addOn) {
    try { addOn = requireNativeModule<CardTextReaderModule>('CardTextReader'); }
    catch { throw new Error('The text reader is missing from this version of the app. Install the newest Android build.'); }
  }
  return addOn;
}

// How big a photo is, turned upright
export function photoSize(path: string): Promise<[number, number]> {
  return reader().photoSize(path);
}

// A box given as left/top/right/bottom, turned into left/top/width/height (what the add-on takes)
const asFractions = (box: Box): Fractions => [box[0], box[1], box[2] - box[0], box[3] - box[1]];

// The extra clues for older cards: the set symbol, the artwork cropped a few slightly different ways,
// the border colour, and a small picture of the art to show beside the candidates
export async function readCardExtras(path: string, card: Fractions): Promise<ScanExtras> {
  const art = asFractions(ART_BOX);
  const shifted = ART_SHIFTS.map(([dx, dy]): Fractions => [art[0] + dx, art[1] + dy, art[2], art[3]]);
  const boxes = [asFractions(SYMBOL_BOX), ...shifted, asFractions(BORDER_STRIP)];
  const widths = [128, ...shifted.map(() => 128), 16];
  const [packed, preview] = await Promise.all([
    reader().grayCrops(path, card, boxes, widths),
    reader().jpegCrop(path, card, art, 240),
  ]);
  const pictures = packed.map(decodeGray);
  return {
    symbol: pictures[0],
    arts: pictures.slice(1, 1 + shifted.length),
    border: borderFromBrightness(meanBrightness(pictures[pictures.length - 1])),
    artPreview: `data:image/jpeg;base64,${preview}`,
  };
}

// Read the card in a photo. "card" is where the card is in the photo (shares of the photo).
// "withExtras" is false to skip the older-card clues (they can be added with readCardExtras).
// The photo is left as it is: call finishPhoto when you're done with it.
export async function readCardPhoto(
  path: string,
  card: Fractions,
  looksLikeName: (text: string) => boolean = () => true,
  withExtras = true,
): Promise<ScanReading> {
  // All four parts in one go: the info line, the name, the whole title band (used only when the
  // name doesn't look like a card's, as on older frames), and the copyright line
  const [info, name, band, bottom] = await reader().readParts(
    path, card,
    [asFractions(CARD_PARTS.infoLine), asFractions(CARD_PARTS.name), asFractions(NAME_BAND), asFractions(CARD_PARTS.bottomLine)],
  );
  return {
    infoText: info,
    // The name from the usual place; if that isn't a card's name, the band's lines too (the same rule the website uses)
    nameText: looksLikeName(name) ? name : `${name}\n${band}`.trim(),
    bottomText: bottom,
    takenAt: Date.now(),
    // (the hands-free loop leaves these out until it has seen a card, because most looks find none)
    extras: withExtras ? await readCardExtras(path, card) : undefined,
  };
}

// Done with a photo: free its memory, and delete the file if the camera took it (not for a gallery photo)
export async function finishPhoto(path: string, deleteFile: boolean): Promise<void> {
  try { await reader().deletePhoto(path, deleteFile); } catch { /* a leftover temporary file is harmless */ }
}

export const cardOcr: CardOcr = {
  // Nothing to load first: ML Kit's reading data is already inside the app. This only checks the add-on is there.
  async warmUp() { reader(); },
};
