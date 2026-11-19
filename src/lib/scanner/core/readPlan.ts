/* =====================================================================
   THE ORDER A CARD IS READ IN (shared by Android and the website; plain TypeScript)
   Reading text from a photo is the slow part of a scan, so this decides what to read
   and, just as important, what NOT to read:
     1. The name (title bar) and the info line are read first, together. That is all it
        takes to find nearly every modern card.
     2. The title band (the whole top strip) is only read if the name box didn't give a
        real card name (older frames put the name in a slightly different place).
     3. The copyright line and the older-card clues (set symbol, artwork, border colour)
        are NOT read up front. They are only used by the fallback that works from the name
        alone, so they are read later, only if the fallback runs (see loadMoreClues, which
        scanResolve.ts calls).
   Each platform plugs in its own way of reading one part (ML Kit on the phone, Tesseract
   on the website) through the small "PartReader" shape below.
   ===================================================================== */

import type { ScanExtras, ScanReading } from './scannerTypes';

// What a platform must be able to do with the photo it was given
export type PartReader = {
  name(): Promise<string>;                    // the text in the title bar's name box
  band(): Promise<string>;                    // the text in the whole title band (scattered)
  info(): Promise<string>;                    // the text of the info line, bottom left
  bottom(): Promise<string>;                  // the copyright line at the very bottom
  clues(): Promise<ScanExtras>;               // symbol, artwork and border colour (the slow older-card clues)
  preview(): Promise<string | undefined>;     // a small picture of the art, to show beside the candidates
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// How many letters some text has (none at all means nothing readable was there)
export const letterCount = (text: string) => (text.match(/[A-Za-z]/g) ?? []).length;

// The title text. The name box first; the whole band too only if the name box didn't give a real name.
// "skipBlank" is for a quick "is there a card?" look: if the name box has hardly any letters at all
// (an empty table), don't bother with the band.
export async function readTitle(reader: PartReader, looksLikeName: (text: string) => boolean, skipBlank = false): Promise<string> {
  const name = await reader.name();
  if (looksLikeName(name)) return name;
  if (skipBlank && letterCount(name) < 3) return name;
  const band = await reader.band();
  return `${name}\n${band}`.trim();
}

// Read a card in the cheap order. "knownTitle" is the title text if it was already read (the hands-free
// camera reads it first to see whether a card is there, so it isn't read twice).
export async function readCardStaged(
  reader: PartReader,
  looksLikeName: (text: string) => boolean,
  knownTitle?: string,
): Promise<ScanReading> {
  const started = now();
  // The title and the info line don't depend on each other, so they are asked for together
  // (the website's reader does them on two workers at once)
  const [nameText, infoText] = await Promise.all([
    knownTitle !== undefined ? Promise.resolve(knownTitle) : readTitle(reader, looksLikeName),
    reader.info(),
  ]);
  const text = now() - started;
  const previewStart = now();
  const artPreview = await reader.preview().catch(() => undefined);
  const timings: Record<string, number> = { text, preview: now() - previewStart };
  return {
    infoText,
    nameText,
    bottomText: '',
    takenAt: Date.now(),
    extras: artPreview ? { artPreview } : undefined,
    moreClues: async () => {
      const cluesStart = now();
      const [bottomText, extras] = await Promise.all([reader.bottom(), reader.clues()]);
      timings.clues = now() - cluesStart;
      return { bottomText, extras };
    },
    timings,
  };
}

// Read the slower extras into a reading, once, if it still has them to read (the fallback calls this)
export async function loadMoreClues(reading: ScanReading): Promise<void> {
  const more = reading.moreClues;
  if (!more) return;
  reading.moreClues = undefined;
  const got = await more();
  reading.bottomText = got.bottomText;
  // (keep the art preview that was made up front)
  reading.extras = { ...reading.extras, ...got.extras };
}

// The timings in a few words, like "0.9 s (photo 0.3, text 0.4, look-up 0.2)", for the line shown after a scan.
// (Shown while the scanner is being tuned: easy to remove once it's quick enough.)
export function timingWords(timings: Record<string, number> | undefined): string {
  if (!timings) return '';
  // (frame: grabbing the live picture; photo: the phone's still photo; check: the quick "has it changed?" look;
  // warm: waiting for the text reader to load; wait: waiting for earlier cards' answers to be put on the list first).
  // "resolve" (the whole work-out of the printing) is also kept in the timings but not listed here, because look-up
  // and clues are its parts and it would be counted twice.
  const steps: [key: string, label: string][] = [
    ['frame', 'frame'], ['photo', 'photo'], ['check', 'change check'], ['warm', 'warm-up'], ['text', 'text'], ['preview', 'picture'],
    ['clues', 'clues'], ['lookup', 'look-up'], ['wait', 'in line'],
  ];
  const seconds = (ms: number) => (ms / 1000).toFixed(1);
  const shown = steps.filter(([key]) => timings[key] !== undefined);
  const total = shown.reduce((sum, [key]) => sum + timings[key], 0);
  return `${seconds(total)} s (${shown.map(([key, label]) => `${label} ${seconds(timings[key])}`).join(', ')})`;
}
