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
    version: '1.8.3',
    date: '2026-11-24',
    lines: ["The magnifying glass (Card Finder) now takes you back to the last place you were in it, like the Shelf button does: the Cards tab, the list of sets, or the set you were looking in."],
  },
  {
    version: '1.8.2',
    date: '2026-11-24',
    lines: ["In the Card Finder's Sets tab, the List or Grid view and the sort you pick on a set's cards are now remembered on this device, so every set opens the way you left the last one, even after closing the app."],
  },
  {
    version: '1.8.1',
    date: '2026-11-24',
    lines: [
      "In the Card Finder, the back arrow at the top now steps back through the Sets tab like any other page: from a card to its set's cards, and from a set's cards to the list of sets. The \"Back to (the set)\" and \"Sets\" links are gone. Tapping the Sets tab while looking inside a set goes to the list of sets.",
      "Tapping the + in a binder, list or deck always opens the Card Finder on the Cards tab.",
    ],
  },
  {
    version: '1.8.0',
    date: '2026-11-24',
    lines: [
      "The Card Finder now has two tabs at the top: Cards (the search, just as it was) and Sets.",
      "Sets lists every set, newest release first, with its symbol, name, code, how many cards it has and its release date. Type in the search box above the list to find a set: it forgives typos and part-words (\"bloomburo\", \"trek cmdr\").",
      "Tap a set to see all its cards as a list or a grid, with the same Sort button as a binder (without Newest added). Tap a card to open it; Back to (the set) brings you back to the set's cards.",
      "A set that came with extras (tokens, Commander decks, Timeshifts, promos, art cards) has a small arrow at the end of its row. Tap it to show them right under the set, and tap it again to hide them. A Commander set's own tokens sit under it. Searching for \"tokens\" opens the sets that have them.",
    ],
  },
  {
    version: '1.7.7',
    date: '2026-11-24',
    lines: ["The thin line under each card in the Grid view is one point bigger, so it is easier to read."],
  },
  {
    version: '1.7.6',
    date: '2026-11-24',
    lines: ["In the Grid view, each card now has a thin line under its picture: the set symbol in its rarity colour, the set code and number, then the price store's symbol and the price of one copy. On small pictures the set code and store symbol drop away first, then the number, so the price always stays."],
  },
  {
    version: '1.7.5',
    date: '2026-11-24',
    lines: ["The icons in a card's window (in a binder, a list or a deck) now have a small word under each one: Edit, Move, Add, Delete, and in a deck Main deck, Sideboard, Maybe and Commander (or Oathbreaker, Signature or Background)."],
  },
  {
    version: '1.7.4',
    date: '2026-11-24',
    lines: ["On the Shelf, Lists and Decks pages, the floating bar for picked binders, lists or decks now sits over the search box and the Add buttons instead of floating above them, so nothing is left peeking out beside it."],
  },
  {
    version: '1.7.3',
    date: '2026-11-24',
    lines: [
      "On the Shelf, a held binder now has five small boxes along the top: Edit, Copy, Reset value, Delete and Select multiple. Dropping a binder on Select multiple starts picking several binders (tap more to pick them), with a floating bar at the top for Edit, Copy, Reset value and Delete. The Lists and Decks pages have Select multiple too, in a held list's or deck's options.",
      "Reset value makes the price every card in a binder or list was added at become today's price, so the % change starts again from 0. It asks first and can't be undone.",
      "Holding a binder near the top or bottom edge of the Shelf now scrolls the shelf by itself.",
    ],
  },
  {
    version: '1.7.2',
    date: '2026-11-24',
    lines: ["With cards selected in a binder or a list, Move to now offers Binder, List and Deck, each opening its own list to choose from. Cards moved to a deck go on its Maybe board."],
  },
  {
    version: '1.7.1',
    date: '2026-11-24',
    lines: ["The bar with Move to and Delete that shows while cards are selected now floats over the search box and the buttons under it, so the list of cards no longer jumps down when you select a card."],
  },
  {
    version: '1.7.0',
    date: '2026-11-24',
    lines: ["Press and hold a card to select it, then tap other cards to select more: in a deck's Main deck, Sideboard and Maybe lists, a binder's List and Grid views, and lists. Picked cards are highlighted with an orange check, and a bar at the top has Move to and a red Delete (which asks once), so it also works for deleting many cards at once. This replaces the Maybe board's Pick cards to move button."],
  },
  {
    version: '1.6.0',
    date: '2026-11-24',
    lines: [
      "Decks have a new Maybe board, a third button beside Main deck and Sideboard, for cards you are only thinking about. Cards on it do not count towards the deck's size, legality, power bracket or price. A card's screen can move it between the main deck, the sideboard and the maybe board, a move into a full main deck asks first, and Pick cards to move lets you move several at once.",
      "In the scanner, Add to collection now has pictures of a binder, a list and a deck at the top, and each list starts with + Binder, + List or + Deck to make a new one. Scanned cards go to a binder or list as before, or onto a deck's Maybe board.",
    ],
  },
  {
    version: '1.5.3',
    date: '2026-11-23',
    lines: ["In the scanner's Stack list, tapping a card now opens its window in front of the list instead of behind it, so a card can be changed without leaving the list. Tapping outside the window closes just the window."],
  },
  {
    version: '1.5.2',
    date: '2026-11-23',
    lines: ["On a phone, a binder on the Shelf now shows its card count on one line and the price store icon with its worth on the next, and in the List view the copies bar moves under the card's name so the name and the three price lines have room."],
  },
  {
    version: '1.5.1',
    date: '2026-11-23',
    lines: ['In the scanner, the "Which printing?" screen now has a finish button (not foil, foil or etched) beside the Use button, so a card can be set as foil while its printing is chosen.'],
  },
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
