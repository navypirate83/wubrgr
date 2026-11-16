/* =====================================================================
   READING A CARD'S INFO LINE (shared, plain TypeScript, no imports)
   Cards from 2014 on have a small line at the bottom left that says exactly
   which printing they are. Two layouts have been printed:
     Older (2014 to 2023):   "123/280 R"      then   "DOM • EN"
     Newer (2023 on):        "R 0123"         then   "MOM • EN"
   that is: the collector number (and, in the older layout, how many cards the
   set has), the rarity letter, the set code (3 to 5 letters or digits; token
   sets have 4, like "TDOM") and the language.
   The text comes from OCR (a computer reading a photo), which makes mistakes:
   letters for digits (O for 0, I for 1, S for 5...), a dot or a plus for the
   bullet, extra spaces and stray marks. parseInfoLine does its best with what
   it's given and says what it found; checking the set code against the real
   list of sets is setCode.ts's job.
   Collector numbers are kept as text, because they can have letters and symbols
   ("123a", "45★"). Leading zeros ("0123") and the "/280" part are dropped.
   ===================================================================== */

export type InfoLine = {
  collectorNumber: string | null;   // "123", "45★", "123a" (no leading zeros, no "/total")
  setTotal: string | null;          // the "280" in "123/280" (older layout only)
  rarity: string | null;            // C, U, R, M (or S, L, T, P for specials)
  setCode: string | null;           // lowercase, as read (not yet checked: see setCode.ts)
  lang: string | null;              // Scryfall's code: "en", "ja", "zhs"...
  layout: 'older' | 'newer' | null; // which of the two layouts the number was in
};

// The language codes printed on cards, and Scryfall's code for each
const LANGUAGES: Record<string, string> = {
  EN: 'en', ES: 'es', FR: 'fr', DE: 'de', IT: 'it', PT: 'pt', JP: 'ja', JA: 'ja', KR: 'ko', KO: 'ko',
  RU: 'ru', CS: 'zhs', CT: 'zht', ZHS: 'zhs', ZHT: 'zht', PH: 'ph', LA: 'la', HE: 'he', GRC: 'grc', AR: 'ar', SA: 'sa',
};
const LANG_WORDS = Object.keys(LANGUAGES).sort((a, b) => b.length - a.length).join('|');

// Letters OCR often reads in place of a digit, and the digit they stand for
const DIGIT_LOOKALIKES: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2' };

// Turn something read as a number ("1O3", "0123") into digits, leaving off leading zeros.
// Null if it has no real digit at all (so a word like "ISIS" never counts as a number).
function cleanNumber(text: string): string | null {
  if (!/[0-9]/.test(text)) return null;
  const digits = text.replace(/[OQDILSBZ]/g, (letter) => DIGIT_LOOKALIKES[letter]);
  return digits.replace(/^0+(?=\d)/, '');
}

// A collector number as read: up to 4 digits (or look-alikes), then maybe one letter or symbol
const NUMBER = '([0-9OQDILSBZ]{1,4})([A-Z★†☆*])?';

export function parseInfoLine(raw: string): InfoLine {
  const result: InfoLine = { collectorNumber: null, setTotal: null, rarity: null, setCode: null, lang: null, layout: null };

  // Tidy the text: capitals, every kind of bullet or dot between words the same, one space at a time
  const text = raw
    .toUpperCase()
    .replace(/[·•∙●○◦⋅‧・]/g, '•')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ {2,}/g, ' ');

  // ----- The set code and language: "DOM • EN" (the bullet may be misread as . + * - or nothing) -----
  // (Letters may follow the language, like the start of the artist's name: the set code is checked against the real sets afterwards)
  const bulleted = new RegExp(`(?:^|[^A-Z0-9])([A-Z0-9]{3,5}) ?[•.+*\\-—_~'"]? ?(${LANG_WORDS})`).exec(text);
  if (bulleted) {
    result.setCode = bulleted[1].toLowerCase();
    result.lang = LANGUAGES[bulleted[2]];
  }

  // ----- The collector number -----
  // Older layout: "123/280" then the rarity: "123/280 R"
  const older = new RegExp(`${NUMBER} ?[/|\\\\] ?([0-9OQDILSBZ]{1,4})(?: ?([CURMSLTP])(?![A-Z]))?`).exec(text);
  // Newer layout: the rarity then the number: "R 0123" (a promo or foil star can follow)
  const newer = new RegExp(`(?:^|[^A-Z0-9])([CURMSLTP]) ?${NUMBER}(?![A-Z0-9])`).exec(text);
  if (older && cleanNumber(older[1]) !== null) {
    result.collectorNumber = cleanNumber(older[1]) + (older[2] ?? '');
    result.setTotal = cleanNumber(older[3]);
    result.rarity = older[4] ?? null;
    result.layout = 'older';
  } else if (newer && cleanNumber(newer[2]) !== null) {
    result.collectorNumber = cleanNumber(newer[2]) + (newer[3] ?? '');
    result.rarity = newer[1];
    result.layout = 'newer';
  } else if (result.setCode) {
    // Only a number on its own (the rarity or the slash was lost): take a 3 or 4 digit one
    const alone = /(?:^|[^A-Z0-9])([0-9]{3,4})([A-Z★†☆*])?(?![A-Z0-9])/.exec(text);
    if (alone) result.collectorNumber = cleanNumber(alone[1]) + (alone[2] ?? '');
  }

  // A letter after the number is lowercase on Scryfall ("123a"); a symbol stays as it is
  if (result.collectorNumber) result.collectorNumber = result.collectorNumber.replace(/[A-Z]$/, (letter) => letter.toLowerCase());
  return result;
}

// The year(s) in the copyright line at the very bottom: "™ & © 1995 Wizards of the Coast"
// or "©1993-1994". Gives the first and last year (the same when there's one), or null.
export function parseCopyrightYears(raw: string): { from: number; to: number } | null {
  const years = [...raw.matchAll(/(?:©|\(C\)|C)\s*((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/gi)];
  if (years.length === 0) return null;
  const from = Number(years[0][1]);
  const to = Number(years[0][2] ?? years[0][1]);
  return { from: Math.min(from, to), to: Math.max(from, to) };
}
