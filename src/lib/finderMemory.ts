/* =====================================================================
   WHERE YOU WERE IN THE CARD FINDER
   The Card Finder (the magnifying glass tab, or "Card Finder" in the side
   menu) has two tabs, Cards and Sets, and in Sets you can be looking inside
   one set. Like the Shelf button, the magnifying glass takes you back to
   the last place you were there: the Cards tab, the list of sets, or the
   set's cards you were looking at. (The card search itself keeps what was
   typed and the card on show, because that screen stays open.)
   It's remembered while the app is open (not after it's closed).
   Plain TypeScript with no React in it.
   ===================================================================== */

// The tab you were on, and the set you had open (its code), if any
let lastTab: 'cards' | 'sets' = 'cards';
let lastShow: string | null = null;

// Note where the person is (called by the Card Finder every time the tab or set changes)
export function rememberFinderPlace(tab: 'cards' | 'sets', show: string | null): void {
  lastTab = tab;
  lastShow = show;
}

// Where the magnifying glass should go: the last place in the Card Finder
export function finderHref(): string {
  const query = new URLSearchParams();
  if (lastTab === 'sets') query.set('tab', 'sets');
  if (lastShow) query.set('show', lastShow);
  const text = query.toString();
  return text ? `/search?${text}` : '/search';
}
