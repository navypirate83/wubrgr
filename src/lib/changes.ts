/* =====================================================================
   THE APP'S VERSION NUMBER AND ITS LIST OF CHANGES (plain TypeScript)
   This is the ONE place the version number and the "Latest changes" list
   live. The Home screen shows the list (see components/home/LatestChanges.tsx)
   and Settings → About shows the version number, both read from here, so
   they can never disagree.

   THE RULE: every change to the app adds an entry at the TOP of the list
   below, with the next version number. The number is X.Y.Z:
     - Z goes up for small changes (a fix, a security update): 1.0.0 → 1.0.1
     - Y goes up for bigger changes (a new feature, a reworked screen), and
       Z starts again at 0: 1.0.4 → 1.1.0
     - X goes up only when the owner of the app says a major version has
       been reached. It is never raised otherwise.
   The same number is also written in app.json ("version"), which is what
   Android records as the installed app's version: change both together.
   Each entry is written in plain words for the people using the app.
   Security updates just say "Security fixes" (no details: the list is
   public). Things only some accounts can see (PRISM, the Admin page, AI
   scanning) are not described here, because everyone reads this list.
   ===================================================================== */

// One version: its number, the day it came out (year-month-day), and what changed, one line each
export type Change = {
  version: string;
  date: string;
  lines: string[];
};

// Every version, NEWEST FIRST. Add new ones at the top.
export const CHANGES: Change[] = [
  {
    version: '1.0.5',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.4',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.3',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.2',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.1',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.0',
    date: '2026-11-21',
    lines: [
      'The app now has version numbers, and this list of changes on the Home screen.',
      'Scanner: a card is no longer matched to a printing from a different set than the one printed on it.',
    ],
  },
  {
    version: '0.9.3',
    date: '2026-11-20',
    lines: ['Security fixes.'],
  },
  {
    version: '0.9.2',
    date: '2026-11-19',
    lines: [
      'Scanner on Android: fixes for the app closing by itself while scanning.',
      'Decks page: the groups of decks can be folded away.',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-11-18',
    lines: [
      'Card screen redesigned: add a card to a list or a deck from it, and edit its finish, language and condition.',
      'Smaller sort buttons, with a picture for each sort.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-17',
    lines: ['New: the card scanner. Point the camera at a card and it finds the card and its printing.'],
  },
  {
    version: '0.8.1',
    date: '2026-11-16',
    lines: [
      'Commander decks can be given a power bracket (1 to 5).',
      'Archidekt and Moxfield deck links can be imported into a binder or a list.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-13',
    lines: ['New: Decks. Build decks by format, with warnings for banned cards, saved to your account and synced across devices.'],
  },
];

// The version the app is at now (the newest entry's)
export const APP_VERSION = CHANGES[0].version;

// A change's day in words, like "November 21, 2026" (in the reader's own language and date style).
// The date is built from its three numbers so the reader's time zone can't shift it to the day before.
export function changeDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
