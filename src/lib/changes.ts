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
    version: '1.5.0',
    date: '2026-11-23',
    lines: [
      "In the List view of a binder, list or deck, each card's price is now three lines: today's price, then how many percent it has changed since the card was added (green with a + when it went up, red with a - when it went down), then the price it had when it was added. The − 3 + bar stays in the middle of the row.",
      "On the Shelf, each binder now shows a dot, your price store's icon and what its cards are worth, after its card count.",
      'New sort: Price change. In a binder, list or deck, the sort button has Gainers (the card whose price has gone up the most, in percent, since you added it comes first) and, tapped again, Losers. On the Shelf, binders can be sorted the same way by how much all their cards have moved.',
      "The binder's Clean-up button now opens a menu: Just close the gaps (as before), or close the gaps and arrange the cards by name, price, price change, color, set, type, rarity, mana value or newest added. An Undo bar appears afterwards and puts every card back.",
    ],
  },
  {
    version: '1.4.1',
    date: '2026-11-22',
    lines: ['The search boxes on the Decks page and inside a deck now show a little X at the far right once you type something; tap it to empty the box.'],
  },
  {
    version: '1.4.0',
    date: '2026-11-22',
    lines: ["The scanner's Stack list now stays on your device when the page is refreshed or the app is reopened, and a new Clear all button empties it in one go."],
  },
  {
    version: '1.3.4',
    date: '2026-11-22',
    lines: ['Security fixes. Wrong passwords now only ever pause logging in for 30 minutes; you are never forced to change your password.'],
  },
  {
    version: '1.3.3',
    date: '2026-11-22',
    lines: ['Security fixes.'],
  },
  {
    version: '1.3.2',
    date: '2026-11-22',
    lines: ['Security fixes.'],
  },
  {
    version: '1.3.1',
    date: '2026-11-22',
    lines: ["Cards you already had get today's price saved the next time you open their binder or list, so price tracking starts now for them too."],
  },
  {
    version: '1.3.0',
    date: '2026-11-22',
    lines: ["Each card now remembers its price on the day you add it to a binder or a list. It is saved in the .csv file's Purchase price column, ready for comparing prices later."],
  },
  {
    version: '1.2.3',
    date: '2026-11-22',
    lines: ['A small note under the Sign in with Google button says Google sign-in is still in development and only authorized users can use it for now.'],
  },
  {
    version: '1.2.2',
    date: '2026-11-22',
    lines: ['Security fixes. An account can hold up to 200 binders, 200 lists, 500 decks and 100,000 cards.'],
  },
  {
    version: '1.2.1',
    date: '2026-11-22',
    lines: ['Security fixes.'],
  },
  {
    version: '1.2.0',
    date: '2026-11-22',
    lines: ['The website has moved to its own address: wubrgr.navypirate83.com. The old address forwards to it. Log in again at the new address.'],
  },
  {
    version: '1.1.3',
    date: '2026-11-22',
    lines: ['Security fixes.'],
  },
  {
    version: '1.1.2',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.1.1',
    date: '2026-11-21',
    lines: [
      'Reskinned cards can now be found by the name printed on them: typing "Ronin\'s Arsenal" in the Card Finder finds Conqueror\'s Flail.',
      'A card printed under another name now shows that name on its card screen and in the Card Finder, with its real name just under it.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-21',
    lines: [
      'Decks now tell foil from non-foil: owning the non-foil of a card no longer counts as owning the foil you picked for a deck.',
      'A deck card you only own a different version of can now be added to a binder or list from its card screen.',
    ],
  },
  {
    version: '1.0.15',
    date: '2026-11-21',
    lines: ['Security fixes. Password reset codes are now 10 letters and digits, and work for 90 minutes.'],
  },
  {
    version: '1.0.14',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.13',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.12',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.11',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.10',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.9',
    date: '2026-11-21',
    lines: ['Scanner fixes.'],
  },
  {
    version: '1.0.8',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.7',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
  {
    version: '1.0.6',
    date: '2026-11-21',
    lines: ['Security fixes.'],
  },
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
