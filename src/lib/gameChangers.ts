/* =====================================================================
   THE GAME CHANGERS LIST
   Commander Brackets name a short list of powerful cards, the "Game
   Changers" (about 50 of them, and Wizards of the Coast updates it now and
   then). Scryfall keeps the current list ("is:gamechanger"), so the app asks
   it for the list, keeps a copy on this device (so it works offline and
   isn't asked for every time), and refreshes the copy once a week.
   A deck uses the list to:
     - draw a yellow border around its Game Changer cards, and
     - set the lowest bracket the deck may have (see deckBrackets.ts).
   ===================================================================== */

import { useEffect, useState } from 'react';
import { searchAllCards } from './scryfall';
import { storageGet, storageSet } from './storage';

// Where the copy is kept on this device: the names, and when they were fetched
const KEY = 'gameChangers';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The names now (lowercase), once known
let known: Set<string> | null = null;
// The lookup on its way, so two askers share one request
let asking: Promise<Set<string>> | null = null;

// A card's name as it's compared: lowercase. Two-sided cards are known by
// both names ("a // b") and by their front side, so any of them matches.
function namesOf(name: string): string[] {
  const full = name.trim().toLowerCase();
  return [full, ...full.split(' // ')];
}

// The copy kept on this device (null if none, or it can't be read)
function savedCopy(): { names: string[]; at: number } | null {
  try {
    const saved = JSON.parse(storageGet(KEY) ?? 'null');
    if (saved && Array.isArray(saved.names) && typeof saved.at === 'number') return saved;
  } catch { /* unreadable: treated as none */ }
  return null;
}

// The list: from memory, or the copy on this device (when it's under a week
// old), or from Scryfall. If Scryfall can't be reached, an older copy is
// used rather than nothing.
export function loadGameChangers(): Promise<Set<string>> {
  if (known) return Promise.resolve(known);
  const saved = savedCopy();
  if (saved && Date.now() - saved.at < WEEK_MS) {
    known = new Set(saved.names);
    return Promise.resolve(known);
  }
  if (!asking) {
    asking = searchAllCards('is:gamechanger')
      .then((cards) => {
        const names = new Set<string>();
        for (const card of cards) namesOf(card.name).forEach((n) => names.add(n));
        // An empty answer is not believed (it would turn every mark off)
        if (names.size === 0) throw new Error('No Game Changers came back');
        known = names;
        storageSet(KEY, JSON.stringify({ names: [...names], at: Date.now() }));
        return names;
      })
      .catch((err) => {
        if (saved) { known = new Set(saved.names); return known; }
        throw err;
      })
      .finally(() => { asking = null; });
  }
  return asking;
}

// Is this card a Game Changer? (The list has to have been loaded already,
// which "useGameChangers" does; until then: no.)
export function isGameChangerNow(name: string): boolean {
  return known ? namesOf(name).some((n) => known!.has(n)) : false;
}

// Has the list arrived yet?
export function gameChangersReady(): boolean {
  return known !== null;
}

// For a screen: the list, loaded as soon as the screen needs it. Gives back
// a function that says whether a card name is a Game Changer ("no" until the
// list arrives, then the screen redraws).
export function useGameChangers(): (name: string) => boolean {
  const [, redraw] = useState(0);
  useEffect(() => {
    let stale = false;
    if (!known) loadGameChangers().then(() => { if (!stale) redraw((n) => n + 1); }).catch(() => { /* no marks if it can't be loaded */ });
    return () => { stale = true; };
  }, []);
  return isGameChangerNow;
}
