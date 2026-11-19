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
   with the extra clues for older cards (set symbol, artwork, border colour) read only when they are needed.
   ===================================================================== */

import { requireNativeModule } from 'expo';
import { ART_BOX, ART_REGION, BORDER_STRIP, CARD_PARTS, NAME_BAND, SYMBOL_REGION, type Box, type ScanExtras, type ScanReading } from '../core/scannerTypes';
import type { Fractions } from '../core/cardInPhoto';
import { borderFromBrightness } from '../core/borderColor';
import { decodeGray, meanBrightness, type PackedGray } from '../core/grayDecode';
import { tinyFromGray } from '../core/frameChange';
import { readCardStaged, readTitle, type PartReader } from '../core/readPlan';
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
  // Get Google's reader loaded and ready by reading a tiny blank picture. Only in builds made after this was added
  // (NEW NATIVE CODE, not yet tried on a phone): older builds don't have it, so it is only called if it exists.
  warmUp?(): Promise<void>;
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

// The slower clues for older cards: one picture of the art area, one of the symbol area, and the border
// colour. Only read when the fallback needs them (see core/readPlan.ts). The pictures are cut up later,
// once it's known which printings are possible, because each frame era has its art and symbol in a slightly
// different place (see core/clueMatch.ts).
async function readClues(path: string, card: Fractions): Promise<ScanExtras> {
  const boxes = [asFractions(ART_REGION), asFractions(SYMBOL_REGION), asFractions(BORDER_STRIP)];
  // The art only needs to be fingerprinted from a small picture; the symbol is tiny, so it keeps more detail
  const widths = [288, 300, 16];
  const [artRegion, symbolRegion, strip] = (await reader().grayCrops(path, card, boxes, widths)).map(decodeGray);
  return { artRegion, symbolRegion, border: borderFromBrightness(meanBrightness(strip)) };
}

// The ways of reading the parts of one card in a photo, in the form the shared reading order
// (core/readPlan.ts) wants. "card" is where the card is in the photo (shares of the photo).
function partsOf(path: string, card: Fractions): PartReader {
  // The text in one part of the card
  const text = async (box: Box) => (await reader().readParts(path, card, [asFractions(box)]))[0];
  return {
    name: () => text(CARD_PARTS.name),
    band: () => text(NAME_BAND),
    info: () => text(CARD_PARTS.infoLine),
    bottom: () => text(CARD_PARTS.bottomLine),
    clues: () => readClues(path, card),
    // A small picture of the art to show beside the candidates
    preview: async () => `data:image/jpeg;base64,${await reader().jpegCrop(path, card, asFractions(ART_BOX), 240)}`,
  };
}

// A tiny grey "signature" of the card area in a photo (see core/frameChange.ts), for noticing that the camera is
// looking at the same scene as before so the text reading can be skipped. It asks the add-on for one very small
// grey picture of the guide area, which uses what the add-on already has (no new native code). Gives null if
// anything goes wrong, and the camera then simply reads the card as it always did.
export async function cardSignature(path: string, card: Fractions): Promise<Uint8Array | null> {
  try {
    const [picture] = await reader().grayCrops(path, card, [[0, 0, 1, 1]], [32]);
    const gray = decodeGray(picture);
    return tinyFromGray(gray.data, gray.width, gray.height);
  } catch {
    return null;
  }
}

// A quick look for the hands-free camera: just the title text (the name, and the whole band only
// if the name box had some text but no real name). Used to see whether there is a card to scan.
export function readTitleOnly(path: string, card: Fractions, looksLikeName: (text: string) => boolean): Promise<string> {
  return readTitle(partsOf(path, card), looksLikeName, true);
}

// Read the card in a photo, in the cheap order (see core/readPlan.ts): name and info line now, the
// copyright line and older-card clues only if they turn out to be needed. "knownTitle" is the title
// text if readTitleOnly already got it. The photo is left as it is: call finishPhoto when the reading
// has been worked out (the extras are read from it then, if needed).
export function readCardPhoto(
  path: string,
  card: Fractions,
  looksLikeName: (text: string) => boolean = () => true,
  knownTitle?: string,
): Promise<ScanReading> {
  return readCardStaged(partsOf(path, card), looksLikeName, knownTitle);
}

// Done with a photo: free its memory, and delete the file if the camera took it (not for a gallery photo)
export async function finishPhoto(path: string, deleteFile: boolean): Promise<void> {
  try { await reader().deletePhoto(path, deleteFile); } catch { /* a leftover temporary file is harmless */ }
}

export const cardOcr: CardOcr = {
  // This checks the add-on is there (and says so if not). Then, only if this build's add-on has the newer "warmUp",
  // Google's reader is loaded now by a practice read, so the first real scan doesn't pay for that. A problem with
  // the practice read is ignored.
  async warmUp() {
    const add = reader();
    if (typeof add.warmUp === 'function') { try { await add.warmUp(); } catch { /* the first scan loads it instead */ } }
  },
};
