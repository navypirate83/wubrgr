/* =====================================================================
   CHECKING A SET CODE AGAINST THE REAL SETS (shared, plain TypeScript)
   OCR often misreads one character of the 3 to 5 character set code: a zero
   for the letter O, an I for a 1, an S for a 5, a B for an 8. A misread code
   is only accepted if it becomes a REAL set code once such look-alikes are
   swapped back, and the real code is what's used. A code that is already
   real is used as it is. If swapping gives more than one real code, the scan
   is flagged as ambiguous and the caller should not trust it alone.
   The bullet between the set code and the language ("ONE • EN") is sometimes read as a LETTER and ends up on the
   end of the code ("ONEX"), so if that isn't a real set either, the code without its last character is tried too.
   ===================================================================== */

export type CheckedSetCode = {
  code: string;          // the real set code (lowercase)
  corrected: boolean;    // it needed look-alike swaps to become real
  ambiguous: boolean;    // more than one real code could be meant (the first is given)
};

// The characters OCR mixes up (each one can be read as any of the others in its list)
const SWAPS: Record<string, string[]> = {
  '0': ['o', 'd'], o: ['0', 'd'], d: ['o', '0'],   // a D read as an O ("SLD" as "SLO") is common
  '1': ['i', 'l'], i: ['1', 'l'], l: ['1', 'i'],
  '5': ['s'], s: ['5'], '8': ['b'], b: ['8'], '2': ['z'], z: ['2'],
};

// Every spelling of a code with its look-alikes swapped (up to 3^letters of them)
function variants(code: string): string[] {
  let all = [''];
  for (const letter of code) {
    const others = SWAPS[letter] ?? [];
    all = all.flatMap((start) => [start + letter, ...others.map((other) => start + other)]);
  }
  return all;
}

// "known" holds every real set code in lowercase. Returns null if no spelling is a real set.
export function checkSetCode(read: string | null, known: ReadonlySet<string>): CheckedSetCode | null {
  if (!read) return null;
  const code = read.toLowerCase();
  if (known.has(code)) return { code, corrected: false, ambiguous: false };
  const real = [...new Set(variants(code).filter((v) => v !== code && known.has(v)))];
  if (real.length > 0) return { code: real[0], corrected: true, ambiguous: real.length > 1 };
  // The bullet read as a letter on the end ("ONEX" for "ONE"): try without the last character (a real 3 or 4 character code only)
  if (code.length >= 4) {
    const shorter = code.slice(0, -1);
    const withoutLast = [...new Set(variants(shorter).filter((v) => known.has(v)))];
    if (withoutLast.length > 0) return { code: withoutLast[0], corrected: true, ambiguous: withoutLast.length > 1 };
  }
  return null;
}
