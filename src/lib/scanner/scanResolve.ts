/* =====================================================================
   FROM A READING TO A PRINTING (shared by Android and the website)
   Takes what a camera read from a card (see core/scannerTypes.ts) and works out
   which printing it is, using the catalogue on the device:
   1. THE MAIN WAY: the info line (bottom left, cards from 2014 on) gives a set
      code, collector number and language. The set code is checked against the
      real sets, the printing is looked up, and the card's NAME (read separately
      from the title bar) must agree with it. If so, the answer is "sure".
   2. THE FALLBACK (no readable info line, or nothing found for it): the NAME
      alone finds every printing of that card, and every clue adds to each printing's score
      (copyright year, border colour, the set symbol compared only against the sets this card was
      printed in, and the artwork's fingerprint compared only against these printings, each printing
      judged with the crops for its own frame era; see core/rank.ts and core/clueMatch.ts).
      With the optional "AI art matching" on (website only for now; see ai/), the artwork is also compared by
      an AI model, which adds one more clue; if its files or model are missing it is skipped without a word.
      One clearly ahead: "likely". Otherwise "pick" (the person chooses, most likely first, with their
      photo's art beside the candidates). Never "sure": this path never adds a card by itself.
   If the name can't be read either, the answer is "none".
   THE SET LOCK (optional, from the gear button; see core/setLock.ts): the fallback only considers the locked
   set's printings. When they all look the same (one set and artwork), that is the answer, "sure" if the name was
   read well, and the slow photo clues are skipped. A card with no printing in the locked set is still found
   from all its printings, but is never "sure". A card whose info line names a DIFFERENT set than the lock is
   only "likely" (the person is asked to check). The rest of the card's printings stay in the list to pick from.
   The slow extras (copyright line, symbol, artwork, border colour) are only read when the
   fallback gets as far as needing them (several printings to tell apart), not for every scan.
   Plain TypeScript with no React in it. Everything here works with no internet.
   ===================================================================== */

import { photoClues } from './core/clueMatch';
import { bestNameMatch, similarity } from './core/fuzzy';
import { parseCopyrightYears, parseInfoLine, type InfoLine } from './core/infoLine';
import { rankCandidates, type Candidate } from './core/rank';
import { checkSetCode } from './core/setCode';
import { decideScan } from './core/decide';
import { loadMoreClues } from './core/readPlan';
import { applySetLock } from './core/setLock';
import { normalizeName } from './core/text';
import { makeBreather } from './core/timeSlice';
import type { Printing } from './core/catalogueTypes';
import { eraOf, type ScanReading } from './core/scannerTypes';
import { allFrontNames, artHashFor, findPrintings, printingsNamed, setCodes, setSymbol } from './catalogue/catalogue';
import { aiScoresForReading } from './ai/aiRun';

export type ScanOutcome = {
  status: 'sure' | 'likely' | 'pick' | 'none';
  reading: ScanReading;
  printing: Printing | null;      // the printing for "sure" and "likely"
  candidates: Printing[];         // the ones to choose from ("pick"), or every printing of the card (to fix a wrong one)
  matched?: number;               // when the list came from the name: how many of the first candidates fit the clues (the rest are "other printings")
  reason: string;                 // in plain words
  info: InfoLine;
  lang: string | null;            // the language read from the card (Scryfall's code), if any
  name: string | null;            // the card's name as found in the catalogue, if the title bar could be matched
};

// What can change how a reading is worked out
export type ResolveOptions = {
  lockedSet?: string | null;      // the code of the set the scanner is locked to, if any
  aiArt?: boolean;                // the "AI art matching" option: also compare the artwork with the AI (if its files are here)
};

// Printings with the same set and artwork look the same in a photo, so they share a "group"
const groupOf = (p: Printing): string => `${p.setCode}|${p.illus ?? p.id}`;

// Working out a card is a lot of plain calculation on the app's one line of work, which the camera and the
// screen share. "breathe" is called now and then inside the long stretches: it pauses for a moment once
// about a dozen milliseconds have been used, so the next camera look and the screen keep moving while a card is
// worked out (see core/timeSlice.ts).
const breathe = makeBreather();

// The real set codes, read once
let realSets: Set<string> | null = null;
const knownSets = async (): Promise<Set<string>> => (realSets ??= new Set(await setCodes()));

// Get ready before the first scan: read the set-code list and the card-name list now (both are kept after the
// first time), so the first scan doesn't pay for them. Called by the scan screen's warm-up (scanWarmUp.ts).
export async function warmResolve(): Promise<void> {
  await knownSets();
  await allFrontNames();
}

// Each set's symbol, read once per set
const symbols = new Map<string, Uint8Array | null>();
async function symbolOf(code: string): Promise<Uint8Array | null> {
  if (!symbols.has(code)) symbols.set(code, await setSymbol(code));
  return symbols.get(code) ?? null;
}

// The fallback, from the name. "nameSimilarity" is how well the title bar matched the name (0 to 1).
async function fromName(reading: ScanReading, name: string, info: InfoLine, lang: string | null, nameSimilarity: number, lockedSet: string | null, aiArt: boolean): Promise<ScanOutcome> {
  const everyPrinting = await printingsNamed(name);
  const base = { reading, info, lang, name };
  if (everyPrinting.length === 0) return { ...base, status: 'none', printing: null, candidates: [], reason: 'No printing of that card was found' };

  // The set lock: only that set's printings are worth considering (if the card has any there)
  const lock = applySetLock(everyPrinting, lockedSet);
  const printings = lock.printings;
  const lockCode = (lockedSet ?? '').toUpperCase();
  // Every printing of the card outside the ones being considered, kept at the end of the list to pick from
  const others = lock.locked ? everyPrinting.filter((p) => !printings.includes(p)) : [];

  // Locked, and what's left all looks the same: that's the answer, with no photo clues needed.
  // "Sure" only when the title bar matched the name well, since this path never has the info line to agree.
  if (lock.locked && new Set(printings.map(groupOf)).size === 1) {
    return {
      ...base, status: nameSimilarity >= 0.9 ? 'sure' : 'likely', printing: printings[0], candidates: [...printings, ...others], matched: printings.length,
      reason: `Locked to ${lockCode}`,
    };
  }
  if (printings.length === 1) return { ...base, status: 'likely', printing: printings[0], candidates: printings, reason: 'The only printing of that card' };

  // Several printings to tell apart: only now are the slower clues worth reading from the photo
  await loadMoreClues(reading);

  // Each printing is judged with the art and symbol crops for ITS OWN frame era (see core/clueMatch.ts):
  // how far the photo's art is from its stored fingerprint, and how much the photo's symbol looks like its set's
  const photo = photoClues(reading.extras);
  const symbolScores = new Map<string, number>();
  const artDistances = new Map<string, number>();
  const candidates: Candidate[] = [];
  for (const p of printings) {
    await breathe();
    const hashes = (await Promise.all([p.illus, p.illusBack].map((id) => (id ? artHashFor(id) : null)))).filter((h): h is Uint8Array => !!h);
    const distance = photo.artDistance(eraOf(p.frame), hashes);
    if (distance !== null) artDistances.set(p.id, distance);
    const symbol = await symbolOf(p.setCode);
    const overlap = symbol ? photo.symbolOverlap(symbol) : null;
    if (overlap !== null) symbolScores.set(p.id, overlap);
    // (a foil and a non-foil of the same set and art look the same in a photo, so they share a group)
    candidates.push({ id: p.id, setCode: p.setCode, year: p.year, border: p.border, group: groupOf(p) });
  }

  // The AI's view of the artwork, when the option is on and everything it needs is here. Any problem at all
  // (files missing, the model won't run, no picture from the camera) just means no AI clue: the ranking below
  // then works exactly as it did before the AI existed.
  let aiScores: Map<string, number> | undefined;
  if (aiArt) {
    try { aiScores = (await aiScoresForReading(reading, printings)) ?? undefined; } catch { aiScores = undefined; }
  }

  const ranked = rankCandidates(candidates, {
    years: parseCopyrightYears(reading.bottomText),
    border: reading.extras?.border ?? null,
    symbolScores,
    artDistances,
    aiScores,
  });
  const byId = new Map(printings.map((p) => [p.id, p]));
  // Most likely first (then, with a lock, the card's printings in other sets)
  const ordered = [...ranked.ordered.map((c) => byId.get(c.id)!), ...others];
  // A lock the card doesn't have a printing in is mentioned, and never makes the answer "likely" by itself
  const note = lock.missing ? `Not in the locked set (${lockCode}). ` : lock.locked ? `Locked to ${lockCode}. ` : '';
  if (ranked.likely) return { ...base, status: 'likely', printing: ordered[0], candidates: ordered, matched: ranked.fits, reason: `${note}Likely (${ranked.why})` };
  return { ...base, status: 'pick', printing: null, candidates: ordered, matched: ranked.fits, reason: `${note}${ranked.fits} printings fit best (${ranked.why})` };
}

// Works out the printing, then lets go of the photo's "read more" step (it holds on to the picture,
// and a reading is kept in the stack list for a long time afterwards)
export async function resolveReading(reading: ScanReading, options: ResolveOptions = {}): Promise<ScanOutcome> {
  try {
    return await resolveInner(reading, options.lockedSet?.toLowerCase() || null, !!options.aiArt);
  } finally {
    reading.moreClues = undefined;
    reading.aiPictures = undefined;
  }
}

async function resolveInner(reading: ScanReading, lockedSet: string | null, aiArt: boolean): Promise<ScanOutcome> {
  const info = parseInfoLine(reading.infoText);
  // The name text may be several lines (the title band's scattered text): the line that matches a real card name best
  const names = await allFrontNames();
  const lines = reading.nameText.split('\n').map(normalizeName).filter((line) => line.length >= 4);
  let nameMatch = null as ReturnType<typeof bestNameMatch>;
  let readName = '';
  for (const line of lines) {
    const match = bestNameMatch(line, names);
    // A very short name found in scattered text is probably chance: it has to match exactly
    if (match && match.name.length < 5 && match.similarity < 1) continue;
    if (match && (!nameMatch || match.similarity > nameMatch.similarity)) { nameMatch = match; readName = line; }
    // (each line is matched against about 30,000 names: let the camera and screen have a turn in between)
    await breathe();
  }
  if (!readName && lines.length > 0) readName = lines[0];
  const name = nameMatch?.name ?? null;

  // 1. The main way: set code + collector number + language, with the name agreeing
  const checked = checkSetCode(info.setCode, await knownSets());
  if (checked && info.collectorNumber) {
    const found = await findPrintings(checked.code, info.collectorNumber, info.lang ?? undefined);
    // The name agrees if it's close to this printing's own front name (when the title bar could be read at all)
    const nameAgrees = !readName ? null : found.length > 0 ? similarity(readName, normalizeName(found[0].name.split(' // ')[0])) >= 0.75 : false;
    const verdict = decideScan({ info, setCode: checked, matches: found.length > 1 ? 1 : found.length, nameAgrees, requireName: true });
    const base = { reading, info, lang: info.lang, name };
    // A set other than the locked one: the person is asked to check, even though the info line was read well
    const offLock = !!lockedSet && found.length >= 1 && found[0].setCode.toLowerCase() !== lockedSet;
    if (found.length >= 1 && verdict.status === 'sure') {
      return offLock
        ? { ...base, status: 'likely', printing: found[0], candidates: found, reason: `${verdict.reason}; not from the locked set (${lockedSet!.toUpperCase()})` }
        : { ...base, status: 'sure', printing: found[0], candidates: found, reason: verdict.reason };
    }
    // The set and number found a printing but the name couldn't be checked: still the best guess
    if (found.length >= 1 && nameAgrees !== false) return { ...base, status: 'likely', printing: found[0], candidates: found, reason: verdict.reason };
    // The name disagrees with the set and number (or nothing was found): trust the name and try the clues
    if (name) {
      const fallback = await fromName(reading, name, info, info.lang, nameMatch?.similarity ?? 0, lockedSet, aiArt);
      return fallback;
    }
    return { ...base, status: 'none', printing: null, candidates: found, reason: verdict.reason };
  }

  // 2. The fallback: the name, and the clues
  if (name) return fromName(reading, name, info, info.lang, nameMatch?.similarity ?? 0, lockedSet, aiArt);
  return { reading, info, lang: info.lang, name: null, status: 'none', printing: null, candidates: [], reason: 'Neither the info line nor the name could be read' };
}
