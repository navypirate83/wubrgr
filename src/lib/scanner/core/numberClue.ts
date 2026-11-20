/* =====================================================================
   USING THE COLLECTOR NUMBER (AND SET) AS A CLUE (shared, plain TypeScript, no imports)
   Many printings of a card share one picture (a plain one, a borderless one, a promo, a showcase), and then the
   artwork can't tell them apart: only the number printed at the bottom can. The main path in scanResolve.ts
   uses the number when the set code is read and checked as well; this file is for the times it is not (the
   set code came out as junk, or the number was read a digit wrong). Then the number is still a strong clue,
   used the same way as the artwork and the symbol: it ADDS to each printing's score (see rank.ts).
     - the number read matches a printing's number exactly: a big bonus,
     - the same digits with a stray letter on the end ("320f" for 320): a fairly big bonus,
     - it is one digit off (OCR often reads a 5 as a 6, a 3 as an 8): a small bonus,
     - the set code (when it is a real set) matches the printing's set: a medium bonus; with the exact number
       as well that is as good as the main path's answer, so the two bonuses add up to more than the
       artwork's pull.
   A number that is not read gives every printing 0, so nothing changes.
   ===================================================================== */

// How much each kind of match adds (the artwork's own pull is up to 3: see ART_WEIGHT in rank.ts)
export const NUMBER_EXACT_BONUS = 2.5;
export const NUMBER_NEAR_BONUS = 0.6;
export const NUMBER_LETTER_BONUS = 1.8;
export const SET_MATCH_BONUS = 1.2;

// A collector number tidied for comparing: no leading zeros, lowercase ("0123" -> "123", "45★" stays "45★", "12A" -> "12a")
export function tidyNumber(number: string): string {
  const lower = number.trim().toLowerCase();
  return lower.replace(/^0+(?=\d)/, '');
}

// How well the number read fits a printing's number: exact, one digit off ("near"), or not at all
export function numberFit(read: string | null, printingNumber: string): 'exact' | 'letter' | 'near' | 'none' {
  if (!read) return 'none';
  const a = tidyNumber(read);
  const b = tidyNumber(printingNumber);
  if (a === b) return 'exact';
  // The same number with a letter or mark stuck on the end that the card's number doesn't have ("320f" read for "320": a foil
  // star or the language letter read as part of it)
  if (/^\d+[a-z★†☆*]$/.test(a) && /^\d+$/.test(b) && a.slice(0, -1) === b) return 'letter';
  // One digit wrong: only for plain numbers of at least 2 digits, the same length (a 1 digit number differs from many)
  if (/^\d{2,}$/.test(a) && /^\d{2,}$/.test(b) && a.length === b.length) {
    let different = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different++;
    if (different === 1) return 'near';
  }
  return 'none';
}

// The bonus for one printing, from what was read: the number, and the set code if it was a real set (lowercase)
export function numberBonus(readNumber: string | null, readSet: string | null, printing: { collectorNumber: string; setCode: string }): number {
  const fit = numberFit(readNumber, printing.collectorNumber);
  let bonus = fit === 'exact' ? NUMBER_EXACT_BONUS : fit === 'letter' ? NUMBER_LETTER_BONUS : fit === 'near' ? NUMBER_NEAR_BONUS : 0;
  if (readSet && printing.setCode.toLowerCase() === readSet.toLowerCase()) bonus += SET_MATCH_BONUS;
  return bonus;
}
