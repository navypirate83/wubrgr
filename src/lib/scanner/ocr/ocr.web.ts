/* =====================================================================
   READING TEXT FROM A CARD PHOTO: THE WEBSITE
   Uses Tesseract.js (text recognition compiled to WebAssembly), in web workers
   so the page doesn't freeze. Nothing native is imported here (Android's
   version is ocr.native.ts).
   Tesseract is weaker than Google's ML Kit on small text, and slower, so the
   website reads ONE full-size photo (taken when you tap), not every video frame,
   and makes each part of the card as easy to read as it can:
     - it crops just the part (the info line, the title bar, the copyright line)
     - makes it about 3 times bigger, grey, and pure black on white (core/ocrPrep.ts)
     - tells Tesseract what kind of text to expect (a block, a single line) and,
       for the info line, which characters can appear at all
   SPEED: two workers are used when the device looks strong enough (4 or more processor
   cores, and enough memory if the browser says), so the title and the info line are read at
   the same time instead of one after the other. And only what is needed is read: the order is
   decided in core/readPlan.ts (the copyright line and the older-card clues are read only if
   the fallback needs them).
   Tesseract's files (its script, its worker, the text engine and the English
   data) are in public/tesseract/ (see the README there), loaded the first time
   they're needed, from this same website, so no outside address is used and
   the files can be saved for offline use.
   ===================================================================== */

import { rgbaToGray } from '../core/phash';
import { binarizeForOcr } from '../core/ocrPrep';
import { borderFromBrightness } from '../core/borderColor';
import { letterCount, readCardStaged, type PartReader } from '../core/readPlan';
import { ART_BOX, ART_REGION, BORDER_STRIP, CARD_PARTS, NAME_BAND, SYMBOL_REGION, type Box, type GrayPicture, type ScanExtras, type ScanReading } from '../core/scannerTypes';
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

// Tesseract's script and where its files are, found once
let engine: Promise<{ tesseract: TesseractGlobal; root: string }> | null = null;

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(script);
  });
}

function loadEngine() {
  if (!engine) {
    engine = (async () => {
      // The site lives in a folder of its own on GitHub Pages (/wubrgr/) but at the top while developing: try both
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
      let folder = '';
      for (const candidate of [`${base}/tesseract`, '/tesseract']) {
        try { await addScript(`${candidate}/tesseract.min.js`); folder = candidate; break; } catch { /* try the next */ }
      }
      const tesseract = tesseractOnPage();
      if (!folder || !tesseract) throw new Error('The text reader (Tesseract) could not be loaded');
      return { tesseract, root: `${location.origin}${folder}` };
    })();
    engine.catch(() => { engine = null; });
  }
  return engine;
}

// Whether this device looks strong enough for a second reader (each one takes a good chunk of memory)
function roomForTwo(): boolean {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  if (!nav) return false;
  return (nav.hardwareConcurrency ?? 1) >= 4 && (nav.deviceMemory === undefined || nav.deviceMemory >= 4);
}

// The workers: made the first time each is needed, kept for every scan after
const workers: (Promise<TesseractWorker> | null)[] = [null, null];
// Each worker does one thing at a time: a new job waits for the one before it (they would otherwise
// change each other's settings halfway)
const queues: Promise<unknown>[] = [Promise.resolve(), Promise.resolve()];

function worker(index: number): Promise<TesseractWorker> {
  if (!workers[index]) {
    workers[index] = (async () => {
      const { tesseract, root } = await loadEngine();
      // 1 = the LSTM engine only (the modern, accurate one)
      return tesseract.createWorker('eng', 1, {
        workerPath: `${root}/worker.min.js`,
        corePath: `${root}/core`,
        langPath: `${root}/lang`,
        gzip: true,
      });
    })();
    workers[index]!.catch(() => { workers[index] = null; });
  }
  return workers[index]!;
}

// Run a job on a worker, after the jobs already waiting for it. The second worker is only used on a
// device with room for it; otherwise its jobs go to the first, one after the other.
function onWorker<T>(wanted: number, job: (reader: TesseractWorker) => Promise<T>): Promise<T> {
  const index = wanted === 1 && roomForTwo() ? 1 : 0;
  const result = queues[index].then(async () => job(await worker(index)));
  queues[index] = result.catch(() => { /* the next job still runs */ });
  return result;
}

export const cardOcr: CardOcr = {
  async warmUp() {
    await worker(0);
    // The second one loads in the background, so the first scan doesn't wait for it
    if (roomForTwo()) worker(1).catch(() => { /* its jobs go to the first worker's turn instead if it never comes */ });
  },
};

/* ---------- reading one part of a card ---------- */

// What Tesseract is told to expect in each part
const KINDS = {
  // the whole band across the top, as scattered text (the name is one of the lines it finds)
  band: { psm: 11, whitelist: '' },
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

// "which" says which worker to use: 0 for the title, 1 for the info line (and the copyright line).
// (The pictures that were read are no longer kept as PNGs for a debug view: making them was slow and nothing used them.)
async function readPart(source: CanvasImageSource, card: { x: number; y: number; w: number; h: number }, box: Box, kind: Kind, which: number): Promise<string> {
  const part = {
    x: card.x + box[0] * card.w,
    y: card.y + box[1] * card.h,
    w: (box[2] - box[0]) * card.w,
    h: (box[3] - box[1]) * card.h,
  };
  return onWorker(which, async (reader) => {
    await reader.setParameters({
      tessedit_pageseg_mode: String(KINDS[kind].psm),
      tessedit_char_whitelist: KINDS[kind].whitelist,
      preserve_interword_spaces: 1,
    });
    const once = async (flip: boolean) => (await reader.recognize(prepare(source, part, flip))).data.text.trim();
    const first = await once(false);
    // The title band is read both ways round, whatever the first way gave
    if (kind === 'band') return `${first}\n${await once(true)}`;
    // A title bar on a dark or coloured frame can come out the wrong way round (text taken
    // for background). If very little was read, try the other way and keep the one with more letters.
    if (kind !== 'name' || letterCount(first) >= 6) return first;
    const second = await once(true);
    return letterCount(second) > letterCount(first) ? second : first;
  });
}

/* ---------- the extra clues: symbol, artwork and border ---------- */

type CardRect = { x: number; y: number; w: number; h: number };

// A part of the photo as a grey picture no wider than "maxWidth"
function grayCrop(source: CanvasImageSource, from: CardRect, maxWidth: number): GrayPicture {
  const width = Math.max(1, Math.min(maxWidth, Math.round(from.w)));
  const height = Math.max(1, Math.round((width * from.h) / from.w));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, from.x, from.y, from.w, from.h, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { data: rgbaToGray(data, width, height), width, height };
}

const partOf = (card: CardRect, box: Box): CardRect => ({
  x: card.x + box[0] * card.w, y: card.y + box[1] * card.h, w: (box[2] - box[0]) * card.w, h: (box[3] - box[1]) * card.h,
});

// One picture of the art area, one of the symbol area, and the border colour (only read if the fallback needs
// them). They are cut up later, once it's known which printings are possible, because each frame era has its
// art and symbol in a slightly different place (see core/clueMatch.ts).
function readClues(source: CanvasImageSource, card: CardRect): ScanExtras {
  const artRegion = grayCrop(source, partOf(card, ART_REGION), 288);
  const symbolRegion = grayCrop(source, partOf(card, SYMBOL_REGION), 300);
  const strip = grayCrop(source, partOf(card, BORDER_STRIP), 16);
  const mean = strip.data.reduce((sum, v) => sum + v, 0) / strip.data.length;
  return { artRegion, symbolRegion, border: borderFromBrightness(mean) };
}

// A small picture of the art as the camera saw it, to show beside the candidates
function artPreview(source: CanvasImageSource, card: CardRect): string {
  const art = partOf(card, ART_BOX);
  const preview = document.createElement('canvas');
  preview.width = 240;
  preview.height = Math.round((240 * art.h) / art.w);
  preview.getContext('2d')!.drawImage(source, art.x, art.y, art.w, art.h, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/jpeg', 0.8);
}

// Read the card in a photo, in the cheap order (see core/readPlan.ts): the title and the info line together
// now (on two workers if there's room), the copyright line and the clues only if they turn out to be needed.
// "card" is where the card is in the photo, in the photo's own pixels (the camera works it out from the
// guide on the screen). The photo (source) is kept by the reading until it has been worked out.
export function readCard(
  source: CanvasImageSource,
  card: { x: number; y: number; w: number; h: number },
  looksLikeName: (text: string) => boolean = () => true,
): Promise<ScanReading> {
  const reader: PartReader = {
    name: () => readPart(source, card, CARD_PARTS.name, 'name', 0),
    band: () => readPart(source, card, NAME_BAND, 'band', 0),
    info: () => readPart(source, card, CARD_PARTS.infoLine, 'info', 1),
    bottom: () => readPart(source, card, CARD_PARTS.bottomLine, 'bottom', 1),
    clues: async () => readClues(source, card),
    preview: async () => artPreview(source, card),
  };
  return readCardStaged(reader, looksLikeName);
}
