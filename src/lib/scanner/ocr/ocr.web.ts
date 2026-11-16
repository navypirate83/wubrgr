/* =====================================================================
   READING TEXT FROM A CARD PHOTO: THE WEBSITE
   Uses Tesseract.js (text recognition compiled to WebAssembly), in a web worker
   so the page doesn't freeze. Nothing native is imported here (Android's
   version is ocr.native.ts).
   Tesseract is weaker than Google's ML Kit on small text, and slower, so the
   website reads ONE full-size photo (taken when you tap), not every video frame,
   and makes each part of the card as easy to read as it can:
     - it crops just the part (the info line, the title bar, the copyright line)
     - makes it about 3 times bigger, grey, and pure black on white (core/ocrPrep.ts)
     - tells Tesseract what kind of text to expect (a block, a single line) and,
       for the info line, which characters can appear at all
   Tesseract's files (its script, its worker, the text engine and the English
   data) are in public/tesseract/ (see the README there), loaded the first time
   they're needed, from this same website, so no outside address is used and
   the files can be saved for offline use.
   ===================================================================== */

import { rgbaToGray } from '../core/phash';
import { binarizeForOcr } from '../core/ocrPrep';
import { CARD_PARTS, type Box, type ScanReading } from '../core/scannerTypes';
import type { CardOcr } from './ocr';

/* ---------- a little of Tesseract's own shape ---------- */

type TesseractWorker = {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>;
  setParameters(params: Record<string, string | number>): Promise<unknown>;
  terminate(): Promise<unknown>;
};
type TesseractGlobal = {
  createWorker(langs: string, oem: number, options: Record<string, unknown>): Promise<TesseractWorker>;
};
const tesseractOnPage = (): TesseractGlobal | undefined => (globalThis as unknown as { Tesseract?: TesseractGlobal }).Tesseract;

/* ---------- loading it, once ---------- */

let loaded: Promise<TesseractWorker> | null = null;

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(script);
  });
}

// The worker: made the first time it's needed, kept for every scan after
function worker(): Promise<TesseractWorker> {
  if (!loaded) {
    loaded = (async () => {
      // The site lives in a folder of its own on GitHub Pages (/wubrgr/) but at the top while developing: try both
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
      let folder = '';
      for (const candidate of [`${base}/tesseract`, '/tesseract']) {
        try { await addScript(`${candidate}/tesseract.min.js`); folder = candidate; break; } catch { /* try the next */ }
      }
      const tesseract = tesseractOnPage();
      if (!folder || !tesseract) throw new Error('The text reader (Tesseract) could not be loaded');
      const root = `${location.origin}${folder}`;
      // 1 = the LSTM engine only (the modern, accurate one)
      return tesseract.createWorker('eng', 1, {
        workerPath: `${root}/worker.min.js`,
        corePath: `${root}/core`,
        langPath: `${root}/lang`,
        gzip: true,
      });
    })();
    loaded.catch(() => { loaded = null; });
  }
  return loaded;
}

export const cardOcr: CardOcr = {
  async warmUp() { await worker(); },
};

/* ---------- reading one part of a card ---------- */

// What Tesseract is told to expect in each part
const KINDS = {
  // two short lines of capitals, digits and the bullet: a block of text, with only those characters allowed
  info: { psm: 6, whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ•·/★*+.-★' },
  // one line of a name: letters, and the marks names have
  name: { psm: 7, whitelist: '' },
  // one line with the copyright: © and a year
  bottom: { psm: 7, whitelist: '' },
} as const;

type Kind = keyof typeof KINDS;

// The part of the photo as a clean black-on-white picture, made bigger
function prepare(source: CanvasImageSource, from: { x: number; y: number; w: number; h: number }, flip: boolean): HTMLCanvasElement {
  // About 3 times bigger, but not enormous
  const scale = Math.max(1, Math.min(3.5, 1600 / from.w));
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(from.w * scale));
  crop.height = Math.max(1, Math.round(from.h * scale));
  const context = crop.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, from.x, from.y, from.w, from.h, 0, 0, crop.width, crop.height);
  const picture = context.getImageData(0, 0, crop.width, crop.height);
  const clean = binarizeForOcr(rgbaToGray(picture.data, crop.width, crop.height), flip);
  for (let i = 0; i < clean.length; i++) {
    picture.data[i * 4] = clean[i];
    picture.data[i * 4 + 1] = clean[i];
    picture.data[i * 4 + 2] = clean[i];
    picture.data[i * 4 + 3] = 255;
  }
  // A white margin around the text helps Tesseract find its edges
  const padded = document.createElement('canvas');
  const margin = Math.round(crop.height * 0.15);
  padded.width = crop.width + margin * 2;
  padded.height = crop.height + margin * 2;
  const paddedContext = padded.getContext('2d')!;
  paddedContext.fillStyle = '#fff';
  paddedContext.fillRect(0, 0, padded.width, padded.height);
  context.putImageData(picture, 0, 0);
  paddedContext.drawImage(crop, margin, margin);
  return padded;
}

// How many letters a reading has (a reading with few is probably the wrong way round)
const letterCount = (text: string) => (text.match(/[A-Za-z]/g) ?? []).length;

async function readPart(source: CanvasImageSource, card: { x: number; y: number; w: number; h: number }, box: Box, kind: Kind): Promise<{ text: string; picture: string }> {
  const part = {
    x: card.x + box[0] * card.w,
    y: card.y + box[1] * card.h,
    w: (box[2] - box[0]) * card.w,
    h: (box[3] - box[1]) * card.h,
  };
  const reader = await worker();
  await reader.setParameters({
    tessedit_pageseg_mode: String(KINDS[kind].psm),
    tessedit_char_whitelist: KINDS[kind].whitelist,
    preserve_interword_spaces: 1,
  });
  const once = async (flip: boolean) => {
    const picture = prepare(source, part, flip);
    const { data } = await reader.recognize(picture);
    return { text: data.text.trim(), picture: picture.toDataURL('image/png') };
  };
  const first = await once(false);
  // A title bar on a dark or coloured frame can come out the wrong way round (text taken
  // for background). If very little was read, try the other way and keep the one with more letters.
  if (kind !== 'name' || letterCount(first.text) >= 6) return first;
  const second = await once(true);
  return letterCount(second.text) > letterCount(first.text) ? second : first;
}

// Read the three parts of a card from a photo. "card" is where the card is in the
// photo, in the photo's own pixels (the camera works it out from the guide on the screen).
export async function readCard(source: CanvasImageSource, card: { x: number; y: number; w: number; h: number }): Promise<ScanReading> {
  const info = await readPart(source, card, CARD_PARTS.infoLine, 'info');
  const name = await readPart(source, card, CARD_PARTS.name, 'name');
  const bottom = await readPart(source, card, CARD_PARTS.bottomLine, 'bottom');
  return {
    infoText: info.text,
    nameText: name.text,
    bottomText: bottom.text,
    takenAt: Date.now(),
    debug: { info: info.picture, name: name.picture, bottom: bottom.picture },
  };
}
