/* =====================================================================
   SETS THAT BELONG TOGETHER, AND A CARD THE CATALOGUE DOESN'T HAVE (shared, plain TypeScript, no imports)
   A modern card prints its own set code at the bottom left ("HOB"). When the scanner reads that code and it is a
   real set, the card in the person's hand IS from that set. If the catalogue then has no printing of that card
   from that set, the right answer is "the catalogue doesn't have this printing" (it may be newer than the
   catalogue), NOT the closest-looking printing from some other set. (This is how a Zur the Enchanter that says
   HOB was once offered as the Modern Masters 2017 one: same card, wrong set.)
   Sets come in families: a main set and the smaller sets that hang off it (its commander decks, promos, tokens,
   art cards). They all point at the main set as their "parent". A card that says HOB but is filed under one of
   HOB's sister sets is still found, so the whole family counts as "that set".
   ===================================================================== */

// What the scanner made of the set code on the card (see setCode.ts): the real code, whether look-alike letters had to be swapped
// to get it ("HO8" read for "HOB"), and whether more than one real set could have been meant
export type ReadSet = { code: string; corrected: boolean; ambiguous?: boolean } | null;

// Every set in the same family as "code": its main set and every set hanging off that main set (lowercase codes).
// "parents" says, for each set code, which set it hangs off (null or missing: it is a main set itself).
export function setFamily(code: string, parents: ReadonlyMap<string, string | null>): Set<string> {
  const own = code.toLowerCase();
  const main = parents.get(own) || own;
  const family = new Set<string>([own, main]);
  for (const [other, parent] of parents) if (other === main || parent === main) family.add(other);
  return family;
}

// Is this card missing from the set its own info line names? True only when the code read is ONE real set (read
// exactly, or with look-alike letters swapped when only one real set fits: the reader often sees "HO8" for "HOB")
// and none of the card's printings is from that set's family. A code that could be two different sets proves nothing. "printingSets" are the set codes of every printing of the card.
export function missingFromReadSet(read: ReadSet, printingSets: readonly string[], parents: ReadonlyMap<string, string | null>): boolean {
  if (!read || (read.corrected && read.ambiguous !== false) || printingSets.length === 0) return false;
  const family = setFamily(read.code, parents);
  return !printingSets.some((code) => family.has(code.toLowerCase()));
}
