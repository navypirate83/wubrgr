# PRISM section: the plan (not built yet)

Written 2026-11-15, from research on prismmtg.com and the Kickstarter
"PRISM: One Card. Every Deck" (by DefCat Productions). **Commander only for now.**

## What PRISM is (the short version)

- One physical copy of a card is used in several Commander decks, instead of
  buying a duplicate for each deck.
- The card itself is never marked. A small paint mark goes on the edge of its
  **inner sleeve** (an outer sleeve goes over it).
- A mark = a **color** (which deck) + a **slot** (a position along the sleeve
  edge). A sleeve edge has 48 slots: 1-24 on Side A, 25-48 on Side B. One deck
  = one fixed slot. (Their "dot splits" stretch it to 96; we skip that.)
- **Pool** = a copy used by 2+ decks. **Core** = a copy used by exactly 1 deck.
- Their tools: import a deck from Moxfield/Archidekt, a results checklist with
  colored deck squares, a "physical total", a marking session with an "undone"
  list, a Swap Planner, deck variants, exports. Free in the browser; a paid
  Membership syncs across devices.
- Their site says it is tournament legal (MTR 3.12). We have not verified this,
  so the app should say "PRISM says...", never claim it ourselves.
- Not confirmed: Kickstarter reward tiers/prices (the page blocked our fetch).

## What we have that they don't

Decks and binders already live in the app. So no importing is needed, the
copies you own can be compared with the copies needed, and changes to a deck
can be noticed automatically.

## Name and permission

"PRISM" is DefCat Productions' name and idea. Before building anything close to
it, either ask them (prismmtg@gmail.com) about a partnership or permission, or
give our section its own name. Decide before the first screen is built.

## Scope for the first version

- Commander decks only: the deck format "Commander" (code `commander`). Other
  command-zone formats (Duel, Pauper Commander, PreDH, Oathbreaker, Tiny
  Leaders) come later, since they have their own rules.
- Up to 48 decks in one PRISM set.
- No variants/dot splits, no Spirit Guide, no store links in version 1.

## The data (new file `src/lib/prismStorage.ts`, saved on the device like decks)

One PRISM set:

```
{
  id, name,
  startCorner: 0 | 1 | 2 | 3,          // which corner of the sleeve counts as slot 1
  decks: [{ deckId, slot: 1-48, color: '#hex' }],   // one slot per deck, never reused
  marked: { [lowercase card name]: deckId[] }       // which decks each card is already marked for
}
```

- A deck's slot never changes once marked (paint doesn't move). Removing a deck
  leaves its slot empty ("slot 7: free").
- `marked` is the record of what was actually painted. It is what swap
  tracking compares against (see below).
- Colors come from a fixed palette of clearly different colors (safe for
  color-blind players, with the slot number always shown beside the color).

## The math (new file `src/lib/prismPlan.ts`, pure code, no screens)

For every card **name** across the chosen decks (printings don't matter, since
the sleeve belongs to the physical card you choose):

- `needed[deck]` = copies of the name in that deck's main deck and command zone
  (the sideboard is ignored).
- `physical` = the most copies any one deck needs (e.g. Deck A 12 Islands,
  Deck B 8 Islands: buy 12; 8 carry both marks, 4 carry only A's).
- `separate` = the sum over decks (what you'd need without PRISM).
- `saved` = `separate - physical` copies; shown as a dollar amount using the
  prices the app already looks up.
- Each physical copy gets its mark list: copy 1 of an Island carries every
  deck that needs at least 1; copy 9 carries only the decks that need 9+.
- **Pool** if its mark list has 2+ decks, **Core** if 1. Basic lands are
  handled the same way (they simply have big numbers).
- A commander card is Core by default. (Their optional "Core (dedicated)"
  setting is a later idea.)
- Compared with what you own: for each name, `owned` (copies in your binders,
  any printing) vs `physical` gives "you own it", "own 1 of 2", or "don't own".
  This reuses the red-border logic in `src/lib/deckOwnership.ts`.

## The screens

1. **Shelf tab.** A fourth button on the shelf switch (Binders / Lists /
   Decks / PRISM), the route `/binders/prism`, and the same menu highlighting
   rules decks have (`shelfMemory.ts`, `SideMenu.tsx`).
2. **PRISM sets page** (`prism.tsx`): the list of your PRISM sets, Add set,
   rename, delete, the same look as the Decks page.
3. **A PRISM set** (`prism/[id].tsx`), with four tabs:
   - **Decks:** tick which Commander decks are in the set. Each gets a slot
     number and color (assigned in order; tap to change; a slot already used
     can't be picked). The sleeve corner setting lives here. A deck whose
     format isn't Commander is greyed out with the reason.
   - **Cards:** the results list. Search box, sort, the same list/grid
     switch. Each row shows the name, "Pool / Core", and a row of small colored
     squares (one per deck that uses it, with its slot number). The line above
     reads like "340 copies needed · 128 shared · saves about $410".
     Own/need status uses the existing red borders.
   - **Mark:** the marking session. Cards not yet painted ("undone"), Pool
     first. Each card shows a drawing of the sleeve edge with the marks to paint
     (color + slot number highlighted). Tap Done and it moves to the next. A
     progress bar and "copy undone list" (to take to the table). Saved on the
     device, so it works with no signal.
   - **Changes:** swap tracking (see below).
4. **Sleeve drawing** (`SleeveEdge.tsx`): a simple drawing of the sleeve edge,
   slots 1-48 split into Side A and Side B, with the chosen corner marked and
   the highlighted slots colored.

## Swap tracking (the part their site does by hand)

- When you change a deck (add or remove a card), the PRISM set compares each
  deck's cards with `marked`.
- **Changes** tab: "To add" (a new card needs this deck's mark) and "To clear"
  (a removed card still carries this deck's mark: wet paint wipes off, dry
  paint means replacing the sleeve).
- **Sleeve swap tip:** if the new card needs exactly the marks an old card
  sleeve already has, say so ("reuse the sleeve from X"), so nothing needs
  painting.
- Marking a change as done updates `marked`.

## Phases

1. **Planner:** storage, the math, the shelf tab, the sets page, the Decks tab
   and the Cards tab (with savings and own/need).
2. **Marking:** the Mark tab and sleeve drawing, saved progress.
3. **Swap tracking:** the Changes tab.
4. **Account and extras:** sync to the server like decks (new `Prism` model
   and routes, merge choice, account deletion, tests), export (CSV, JSON, a
   printable sheet), Help topic, README.

Each phase gets its own commit, a Help update, and no changes to existing
decks. Nothing in a deck or the .CSV changes.

## Open questions

- Name and permission (above).
- Other command-zone formats later, or Commander only for good?
- Should the Cards tab pick which printing to use for a physical copy (one you
  own is the obvious choice)?
- Phone first or web first for the marking session? (It will be used at a
  table, so the phone layout matters most.)
