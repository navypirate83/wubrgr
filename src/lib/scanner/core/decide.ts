/* =====================================================================
   DECIDING HOW SURE A SCAN IS (shared, plain TypeScript, no imports)
   Puts together what the scanner found and says how far to trust it:
     - "sure": the set code is a real one, the set and collector number found
       exactly one printing, and the card's NAME (read separately from the title
       bar) agrees with that printing. Safe to add automatically (on Android, once
       the same reading comes up on a few frames in a row; see the camera code).
     - "uncertain": something doesn't add up (the name disagrees with the set and
       number, several printings share them, or the set code needed guessing). It
       goes on the list marked to be fixed, and is never added by itself.
     - "none": nothing usable was read.
   A name that couldn't be read at all doesn't count as a disagreement, but on the
   web (where a single photo is all there is) it's not enough to be "sure" either.
   ===================================================================== */

import type { InfoLine } from './infoLine';
import type { CheckedSetCode } from './setCode';

export type ScanVerdict = {
  status: 'sure' | 'uncertain' | 'none';
  reason: string;          // in plain words, for testing and the scan list
};

export type Evidence = {
  info: InfoLine;
  setCode: CheckedSetCode | null;      // the info line's set code checked against the real sets
  matches: number;                     // how many printings the set and number found
  nameAgrees: boolean | null;          // the title-bar name matches that printing (null: no name was read)
  requireName: boolean;                // true on the web: a single photo needs the name to agree
};

export function decideScan(e: Evidence): ScanVerdict {
  if (!e.info.setCode && !e.info.collectorNumber) return { status: 'none', reason: 'No info line could be read' };
  if (!e.setCode) return { status: 'uncertain', reason: 'The set code is not a real set' };
  if (!e.info.collectorNumber) return { status: 'uncertain', reason: 'No collector number was read' };
  if (e.matches === 0) return { status: 'uncertain', reason: 'No printing has that set and number' };
  if (e.matches > 1) return { status: 'uncertain', reason: 'More than one printing has that set and number' };
  if (e.setCode.corrected && e.setCode.ambiguous) return { status: 'uncertain', reason: 'The set code could be more than one set' };
  if (e.nameAgrees === false) return { status: 'uncertain', reason: 'The name does not match that set and number' };
  if (e.nameAgrees === null && e.requireName) return { status: 'uncertain', reason: 'The name could not be read to check it' };
  return { status: 'sure', reason: e.setCode.corrected ? 'Matched (the set code needed a small correction)' : 'Matched' };
}
