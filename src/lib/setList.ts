/* =====================================================================
   THE LIST OF SETS (the Card Finder's Sets tab)
   Scryfall lists every set on its own, but a set's tokens, its Commander
   decks, its promos and so on are listed as separate sets that point at
   the "main" set they came with ("parent_set_code"). This turns that flat
   list into what the Sets tab shows:
     - one row per MAIN set, newest release first;
     - under each, the extras released with it (its tokens, Commander,
       Timeshifts, promos, art cards...), each with how deep it sits, so a
       Commander set's own tokens sit under the Commander set.
   Sets that exist only on a computer screen (Arena and Alchemy sets) are
   left out: this app is for paper cards.
   It also does the search for that tab: a forgiving ("fuzzy") match, so
   part of a word, the letters of a word in order ("cmdr" for "commander")
   or a small typo still finds the set.
   Plain TypeScript with no React in it.
   ===================================================================== */

// One set, the way this file needs it
export type SetInfo = {
  code: string;              // like "blb"
  name: string;              // like "Bloomburrow"
  type: string;              // Scryfall's kind of set: "expansion", "token", "commander"...
  parent: string | null;     // the main set this one came with (none for a main set)
  count: number;             // how many cards Scryfall lists in it
  released: string;          // the day it came out, "2024-08-02" (empty if unknown)
  digital: boolean;          // only exists on a computer screen (Arena, Alchemy...)
  icon: string;              // the address of its symbol picture
};

// An extra set, and how far in it sits (1: under the main set, 2: under another extra)
export type SetKid = SetInfo & { depth: number };

// A main set with its extras, already in the order to show them
export type SetNode = SetInfo & { kids: SetKid[] };

// The order a set's extras are listed in: tokens first, then Commander, then the rest, then promos and art cards
function rankOf(type: string): number {
  if (type === 'token') return 0;
  if (type === 'commander') return 1;
  if (type === 'promo') return 3;
  if (type === 'memorabilia' || type === 'masterpiece') return 4;
  return 2;
}

// Group the flat list: main sets newest first, each with its extras beneath it
export function buildSetList(sets: SetInfo[]): SetNode[] {
  const paper = sets.filter((set) => !set.digital);
  const known = new Set(paper.map((set) => set.code));
  const children = new Map<string, SetInfo[]>();
  const roots: SetInfo[] = [];
  for (const set of paper) {
    // A set whose main set isn't in the list (or is only digital) stands on its own
    if (set.parent && set.parent !== set.code && known.has(set.parent)) {
      const list = children.get(set.parent) ?? [];
      list.push(set);
      children.set(set.parent, list);
    } else {
      roots.push(set);
    }
  }

  // Walk down from a set, listing its extras in order, each one followed by its own extras
  const seen = new Set<string>();
  function kidsOf(code: string, depth: number): SetKid[] {
    const out: SetKid[] = [];
    const list = [...(children.get(code) ?? [])].sort((a, b) =>
      rankOf(a.type) - rankOf(b.type) || a.released.localeCompare(b.released) || a.name.localeCompare(b.name));
    for (const kid of list) {
      if (seen.has(kid.code)) continue;   // never loops, even if the data is odd
      seen.add(kid.code);
      out.push({ ...kid, depth }, ...kidsOf(kid.code, depth + 1));
    }
    return out;
  }

  return roots
    .sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name))
    .map((root) => {
      seen.add(root.code);
      return { ...root, kids: kidsOf(root.code, 1) };
    });
}

/* ---------------------------------------------------------------------
   THE SEARCH
   --------------------------------------------------------------------- */

// How many letters apart two short pieces of text are (each change, add or removal counts one)
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

// Is a typed word close to a word in a set's name? Close means: it is part of the word, its letters
// appear in the word in order starting with the same letter ("cmdr"), or it is a typo or two away.
function wordIsNear(typed: string, word: string): boolean {
  if (word.includes(typed)) return true;
  let at = 0;
  for (let i = 0; i < word.length && at < typed.length; i++) if (word[i] === typed[at]) at++;
  if (typed.length >= 3 && at === typed.length && typed[0] === word[0]) return true;
  return typed.length >= 4 && distance(typed, word.slice(0, typed.length + 1)) <= (typed.length > 6 ? 2 : 1);
}

// Does every word typed come close to a word of the text? (Nothing typed matches everything.)
export function fuzzyMatches(typed: string, text: string): boolean {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return typed.toLowerCase().split(/\s+/).filter(Boolean)
    .every((piece) => words.some((word) => wordIsNear(piece, word)));
}

// What the search leaves showing: each main set that matches, or that has an extra that matches.
// "open" says to show the extras without being asked (an extra matched but the main set itself
// didn't), and "hits" are the extras that matched (to be marked).
export type SetResult = { node: SetNode; open: boolean; hits: Set<string> };
export function filterSets(nodes: SetNode[], typed: string): SetResult[] {
  if (!typed.trim()) return nodes.map((node) => ({ node, open: false, hits: new Set() }));
  const out: SetResult[] = [];
  for (const node of nodes) {
    const self = fuzzyMatches(typed, `${node.name} ${node.code}`);
    const hits = new Set(node.kids.filter((kid) => fuzzyMatches(typed, `${kid.name} ${kid.code}`)).map((kid) => kid.code));
    if (self || hits.size > 0) out.push({ node, open: !self && hits.size > 0, hits });
  }
  return out;
}
