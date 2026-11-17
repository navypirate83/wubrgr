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
      One clearly ahead: "likely". Otherwise "pick" (the person chooses, most likely first, with their
      photo's art beside the candidates). Never "sure": this path never adds a card by itself.
   If the name can't be read either, the answer is "none".
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
import { normalizeName } from './core/text';
import type { Printing } from './core/catalogueTypes';
import { eraOf, type ScanReading } from './core/scannerTypes';
import { allFrontNames, artHashFor, findPrintings, printingsNamed, setCodes, setSymbol } from './catalogue/catalogue';

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

// The real set codes, read once
let realSets: Set<string> | null = null;
const knownSets = async (): Promise<Set<string>> => (realSets ??= new Set(await setCodes()));

// Each set's symbol, read once per set
const symbols = new Map<string, Uint8Array | null>();
async function symbolOf(code: string): Promise<Uint8Array | null> {
  if (!symbols.has(code)) symbols.set(code, await setSymbol(code));
  return symbols.get(code) ?? null;
}

// The fallback, from the name
async function fromName(reading: ScanReading, name: string, info: InfoLine, lang: string | null): Promise<ScanOutcome> {
  const printings = await printingsNamed(name);
  const base = { reading, info, lang, name };
  if (printings.length === 0) return { ...base, status: 'none', printing: null, candidates: [], reason: 'No printing of that card was found' };
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
    const hashes = (await Promise.all([p.illus, p.illusBack].map((id) => (id ? artHashFor(id) : null)))).filter((h): h is Uint8Array => !!h);
    const distance = photo.artDistance(eraOf(p.frame), hashes);
    if (distance !== null) artDistances.set(p.id, distance);
    const symbol = await symbolOf(p.setCode);
    const overlap = symbol ? photo.symbolOverlap(symbol) : null;
    if (overlap !== null) symbolScores.set(p.id, overlap);
    // (a foil and a non-foil of the same set and art look the same in a photo, so they share a group)
    candidates.push({ id: p.id, setCode: p.setCode, year: p.year, border: p.border, group: `${p.setCode}|${p.illus ?? p.id}` });
  }

  const ranked = rankCandidates(candidates, {
    years: parseCopyrightYears(reading.bottomText),
    border: reading.extras?.border ?? null,
    symbolScores,
    artDistances,
  });
  const byId = new Map(printings.map((p) => [p.id, p]));
  // Most likely first
  const ordered = ranked.ordered.map((c) => byId.get(c.id)!);
  if (ranked.likely) return { ...base, status: 'likely', printing: ordered[0], candidates: ordered, matched: ranked.fits, reason: `Likely (${ranked.why})` };
  return { ...base, status: 'pick', printing: null, candidates: ordered, matched: ranked.fits, reason: `${ranked.fits} printings fit best (${ranked.why})` };
}

// Works out the printing, then lets go of the photo's "read more" step (it holds on to the picture,
// and a reading is kept in the stack list for a long time afterwards)
export async function resolveReading(reading: ScanReading): Promise<ScanOutcome> {
  try {
    return await resolveInner(reading);
  } finally {
    reading.moreClues = undefined;
  }
}

async function resolveInner(reading: ScanReading): Promise<ScanOutcome> {
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
    if (found.length >= 1 && verdict.status === 'sure') return { ...base, status: 'sure', printing: found[0], candidates: found, reason: verdict.reason };
    // The set and number found a printing but the name couldn't be checked: still the best guess
    if (found.length >= 1 && nameAgrees !== false) return { ...base, status: 'likely', printing: found[0], candidates: found, reason: verdict.reason };
    // The name disagrees with the set and number (or nothing was found): trust the name and try the clues
    if (name) {
      const fallback = await fromName(reading, name, info, info.lang);
      return fallback;
    }
    return { ...base, status: 'none', printing: null, candidates: found, reason: verdict.reason };
  }

  // 2. The fallback: the name, and the clues
  if (name) return fromName(reading, name, info, info.lang);
  return { reading, info, lang: info.lang, name: null, status: 'none', printing: null, candidates: [], reason: 'Neither the info line nor the name could be read' };
}
