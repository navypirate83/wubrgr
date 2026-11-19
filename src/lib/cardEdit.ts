/* =====================================================================
   EDITING A CARD YOU OWN (shared, plain TypeScript)
   What the card screen's Edit mode can change about a card in a binder,
   a list or a deck: its finish (not foil, foil or etched), its language
   (and so its picture) and its CONDITION. The number of copies has its
   own code (see withCount in binderStorage.ts).
   - A card's condition is kept in its notes ("extra") under the name
     "Condition", the same column a ManaBox .csv file has. That means it
     is saved with the card on this device, goes to your account on the
     server with every other note, and comes out again in a downloaded
     file. The values are ManaBox's words (near_mint...), and these are
     the names shown on screen.
   - A card with no condition saved is shown as Near Mint.
   This file imports only types, so it can be tested on its own.
   ===================================================================== */

import type { BinderCard } from './binderStorage';
import type { Finish } from './cards';

/* ---------- condition ---------- */

// The six conditions, best first: what's saved, and what's shown
export const CONDITIONS: { code: string; label: string }[] = [
  { code: 'mint', label: 'Mint' },
  { code: 'near_mint', label: 'Near Mint' },
  { code: 'lightly_played', label: 'Light Played' },
  { code: 'moderately_played', label: 'Moderately Played' },
  { code: 'heavily_played', label: 'Heavily Played' },
  { code: 'damaged', label: 'Damaged' },
];

// Other ways a condition gets written in the files people upload
const CONDITION_ALIASES: Record<string, string> = {
  m: 'mint', nm: 'near_mint', lp: 'lightly_played', light_played: 'lightly_played', slightly_played: 'lightly_played',
  mp: 'moderately_played', moderate_played: 'moderately_played', hp: 'heavily_played', heavy_played: 'heavily_played',
  dmg: 'damaged', poor: 'damaged',
};

// A condition as written anywhere, as one of the six codes (anything
// unknown or missing counts as near mint)
export function normalizeCondition(value: string | undefined): string {
  const code = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (CONDITIONS.some((c) => c.code === code)) return code;
  return CONDITION_ALIASES[code] ?? 'near_mint';
}

// A card's condition, as its code
export function conditionOf(card: BinderCard): string {
  return normalizeCondition(card.extra?.Condition);
}

// The name shown for a condition code
export function conditionLabel(code: string): string {
  return CONDITIONS.find((c) => c.code === code)?.label ?? 'Near Mint';
}

/* ---------- making a change ---------- */

// A change to make to a card. A "null" takes that thing away (no foil, no
// language note, no note of that name).
export type CardEdit = {
  foil?: boolean;
  lang?: string | null;
  image?: string;
  extra?: Record<string, string | null>;
};

// The card with the change made (a new object: the card given isn't changed)
export function applyEdit<T extends BinderCard>(card: T, edit: CardEdit): T {
  const next: T = { ...card };
  if (edit.foil !== undefined) {
    if (edit.foil) next.foil = true;
    else delete next.foil;
  }
  if (edit.lang !== undefined) {
    if (edit.lang) next.lang = edit.lang;
    else delete next.lang;
  }
  if (edit.image) next.image = edit.image;
  if (edit.extra) {
    const extra = { ...(card.extra ?? {}) };
    for (const [name, value] of Object.entries(edit.extra)) {
      if (value === null) delete extra[name];
      else extra[name] = value;
    }
    next.extra = extra;
  }
  return next;
}

// The change that gives a card this finish ("etched" is a foil card with the note Foil = etched)
export function finishEdit(finish: Finish): CardEdit {
  return { foil: finish !== 'nonfoil', extra: { Foil: finish === 'etched' ? 'etched' : null } };
}

// The change that gives a card this condition
export function conditionEdit(code: string): CardEdit {
  return { extra: { Condition: normalizeCondition(code) } };
}

// The change that puts a card in this language, with that language's picture
// (English is the card's usual, so it has no language note)
export function languageEdit(lang: string, image: string | null): CardEdit {
  return { lang: lang === 'en' ? null : lang, ...(image ? { image } : {}) };
}
