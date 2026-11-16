/* =====================================================================
   CHECKING A SET CODE AGAINST THE REAL SETS (shared, plain TypeScript)
   OCR often misreads one character of the 3 to 5 character set code: a zero
   for the letter O, an I for a 1, an S for a 5, a B for an 8. A misread code
   is only accepted if it becomes a REAL set code once such look-alikes are
   swapped back, and the real code is what's used. A code that is already
   real is used as it is. If swapping gives more than one real code, the scan
   is flagged as ambiguous and the caller should not trust it alone.
   ===================================================================== */

export type CheckedSetCode = {
  code: string;          // the real set code (lowercase)
  corrected: boolean;    // it needed look-alike swaps to become real
  ambiguous: boolean;    // more than one real code could be meant (the first is given)
};

// The characters OCR mixes up (both ways round)
const SWAPS: Record<string, string> = { '0': 'o', o: '0', '1': 'i', i: '1', '5': 's', s: '5', '8': 'b', b: '8' };

// Every spelling of a code with its look-alikes swapped (up to 2^letters of them)
function variants(code: string): string[] {
  let all = [''];
  for (const letter of code) {
    const other = SWAPS[letter];
    all = all.flatMap((start) => (other ? [start + letter, start + other] : [start + letter]));
  }
  return all;
}

// "known" holds every real set code in lowercase. Returns null if no spelling is a real set.
export function checkSetCode(read: string | null, known: ReadonlySet<string>): CheckedSetCode | null {
  if (!read) return null;
  const code = read.toLowerCase();
  if (known.has(code)) return { code, corrected: false, ambiguous: false };
  const real = [...new Set(variants(code).filter((v) => v !== code && known.has(v)))];
  if (real.length === 0) return null;
  return { code: real[0], corrected: true, ambiguous: real.length > 1 };
}
