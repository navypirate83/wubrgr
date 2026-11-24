/* =====================================================================
   COMMANDER POWER BRACKETS
   Commander decks can be marked with one of the five official Commander
   Brackets, a rough way to tell a group how strong a deck is before the
   game starts:
     1 Exhibition: theme over power, winning isn't the point
     2 Core: about a precon's strength
     3 Upgraded: stronger than a precon
     4 Optimized: built to win
     5 cEDH: competitive, built for the top tables
   You choose the bracket yourself (the app doesn't work it out from the
   cards). A deck with none chosen is "not rated". Only Commander decks have
   brackets (not Oathbreaker, Duel Commander or the other formats).
   GAME CHANGERS (see gameChangers.ts) set a floor: a deck with 1 to 3 of them
   is at least Bracket 3 (so 3, 4 or 5 may be chosen), and one with 4 or more is
   at least Bracket 4 (4 or 5). A deck below its floor is shown at the floor
   automatically, without changing what was chosen.
   Plain TypeScript with no React in it.
   ===================================================================== */

export type Bracket = { n: 1 | 2 | 3 | 4 | 5; name: string; about: string };

// The five brackets, weakest first
export const BRACKETS: Bracket[] = [
  { n: 1, name: 'Exhibition', about: 'Theme over power. Winning is not the point.' },
  { n: 2, name: 'Core', about: 'About the strength of a preconstructed deck.' },
  { n: 3, name: 'Upgraded', about: 'Stronger than a precon, with a few powerful cards.' },
  { n: 4, name: 'Optimized', about: 'Built to win, with strong cards and tight play.' },
  { n: 5, name: 'cEDH', about: 'Competitive Commander, built for the top tables.' },
];

// Does this format have brackets? (Only Commander does.)
export function hasBrackets(formatCode: string | undefined): boolean {
  return formatCode === 'commander';
}

// Anything saved that isn't a whole number from 1 to 5 means "not rated" (undefined)
export function cleanBracket(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : undefined;
}

// A bracket's name ("Upgraded"), or "Not rated"
export function bracketName(n: number | undefined): string {
  return BRACKETS.find((b) => b.n === n)?.name ?? 'Not rated';
}

// How a bracket is written on screen: "Bracket 3 · Upgraded" (nothing for a deck that isn't rated)
export function bracketText(n: number | undefined): string {
  return cleanBracket(n) === undefined ? '' : `Bracket ${n} · ${bracketName(n)}`;
}

// Fingerprint pieces for the server sync: nothing for a deck that isn't rated, so
// decks saved before brackets existed keep the same fingerprint
export function bracketPart(n: unknown): number[] {
  const bracket = cleanBracket(n);
  return bracket === undefined ? [] : [bracket];
}

// How many Game Changers a deck holds (every copy counted; the sideboard doesn't count).
// "isGameChanger" says whether a card name is one.
export function countGameChangers(cards: { name: string; count?: number; zone?: string }[], isGameChanger: (name: string) => boolean): number {
  return cards.reduce((sum, card) => (card.zone !== 'side' && card.zone !== 'maybe' && isGameChanger(card.name) ? sum + (card.count ?? 1) : sum), 0);
}

// The lowest bracket a deck with this many Game Changers may have: 1 (none), 3 (one to three) or 4 (four or more)
export function lowestBracket(gameChangers: number): number {
  return gameChangers >= 4 ? 4 : gameChangers >= 1 ? 3 : 1;
}

// May a deck with this many Game Changers be marked with this bracket?
export function bracketAllowed(n: number, gameChangers: number): boolean {
  return n >= lowestBracket(gameChangers) && n <= 5;
}

// The bracket a deck counts as: the one chosen, raised to the lowest allowed when it has
// Game Changers (a deck with some and none chosen counts as that lowest). undefined: not rated.
export function effectiveBracket(chosen: unknown, gameChangers: number): number | undefined {
  const bracket = cleanBracket(chosen);
  if (gameChangers === 0) return bracket;
  return Math.max(bracket ?? 0, lowestBracket(gameChangers));
}
