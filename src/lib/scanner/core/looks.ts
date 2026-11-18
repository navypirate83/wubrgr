/* =====================================================================
   HOW A PRINTING LOOKS (shared, plain TypeScript, no imports)
   Most Magic cards use the usual frame: a border, the name in a bar at the
   top, the picture in a box, the small print at the bottom left. Some are
   different: FULL ART cards (the picture runs to the edges), BORDERLESS
   cards, SHOWCASE and EXTENDED ART frames, ETCHED and TEXTURED foils,
   SERIALIZED cards, and so on. On those the name and the small print can
   be in other places, in other fonts, over busy artwork, so the scanner
   needs to know when a printing is one of them.
   This file works out a printing's "look" from Scryfall's card data (the
   catalogue's build script stores it, in its "looks" table) and describes
   one in plain words. Only what Scryfall tells us is kept; nothing is guessed.
   ===================================================================== */

// How one printing looks, beyond the ordinary
export type Look = {
  fullArt: boolean;          // the picture runs to the edges of the card
  borderless: boolean;       // no border at all
  textless: boolean;         // no words on the picture
  frameEffects: string[];    // Scryfall's frame effects that change the look: "showcase", "extendedart", "etched"...
  promoTypes: string[];      // special treatments: "serialized", "textured", "galaxyfoil"...
};

// An ordinary printing
export const PLAIN_LOOK: Look = { fullArt: false, borderless: false, textless: false, frameEffects: [], promoTypes: [] };

// The parts of a Scryfall card we read a look from
export type LookSource = {
  full_art?: boolean;
  textless?: boolean;
  border_color?: string;
  frame_effects?: string[];
  promo_types?: string[];
};

// Frame effects that say nothing about how the card LOOKS (a legendary card has a crown
// but is otherwise ordinary; double-faced cards all end in "dfc"), so they're left out
const NOT_A_LOOK = new Set([
  'legendary', 'nyxtouched', 'draft', 'companion', 'devoid', 'miracle', 'tombstone', 'spree', 'enchantment', 'lesson',
]);
const keepEffect = (effect: string) => !NOT_A_LOOK.has(effect) && !effect.endsWith('dfc');

// The special treatments (promo types) that change how a card looks
const LOOK_PROMOS = new Set([
  'serialized', 'textured', 'galaxyfoil', 'surgefoil', 'oilslick', 'confettifoil', 'neonink', 'ripplefoil',
  'rainbowfoil', 'halofoil', 'stepandcompleat', 'fracturefoil', 'gilded', 'embossed', 'silverfoil',
  'doublerainbow', 'invisibleink', 'vendorfoil', 'doubleexposure', 'glossy',
]);

// A look, from Scryfall's card data
export function lookFromScryfall(card: LookSource): Look {
  return {
    fullArt: card.full_art === true,
    borderless: card.border_color === 'borderless',
    textless: card.textless === true,
    frameEffects: (card.frame_effects ?? []).filter(keepEffect),
    promoTypes: (card.promo_types ?? []).filter((promo) => LOOK_PROMOS.has(promo)),
  };
}

// Does the catalogue need a row for it? (Borderless is already in each printing's border colour,
// so on its own it needs no row.)
export function needsLookRow(look: Look): boolean {
  return look.fullArt || look.textless || look.frameEffects.length > 0 || look.promoTypes.length > 0;
}

// Is the picture laid out in an unusual way: no ordinary frame, so the name and the small print
// may be somewhere else or over the artwork? (Textured or serialized cards still have the usual layout.)
export function isUnusualLayout(look: Look): boolean {
  return look.fullArt || look.borderless || look.textless
    || look.frameEffects.some((effect) => effect === 'showcase' || effect === 'extendedart' || effect === 'fullart' || effect === 'shatteredglass');
}

// Is there anything unusual about it at all?
export function isSpecialLook(look: Look): boolean {
  return needsLookRow(look) || look.borderless;
}

// The words for each frame effect or special treatment (anything not listed is shown as it is)
const WORDS: Record<string, string> = {
  showcase: 'Showcase', extendedart: 'Extended art', etched: 'Etched foil', inverted: 'Inverted frame', snow: 'Snow frame',
  shatteredglass: 'Shattered glass', serialized: 'Serialized', textured: 'Textured foil', galaxyfoil: 'Galaxy foil',
  surgefoil: 'Surge foil', oilslick: 'Oil slick foil', confettifoil: 'Confetti foil', neonink: 'Neon ink',
  ripplefoil: 'Ripple foil', rainbowfoil: 'Rainbow foil', halofoil: 'Halo foil', stepandcompleat: 'Step-and-compleat foil',
  fracturefoil: 'Fracture foil', gilded: 'Gilded foil', embossed: 'Embossed', silverfoil: 'Silver foil',
  doublerainbow: 'Double rainbow foil', invisibleink: 'Invisible ink', vendorfoil: 'Vendor foil',
  doubleexposure: 'Double exposure', glossy: 'Glossy', fullart: 'Full art', colorshifted: 'Color-shifted', translucent: 'Translucent',
};

// A look in plain words, like ["Full art", "Showcase"] (empty for an ordinary printing)
export function lookLabels(look: Look): string[] {
  const labels: string[] = [];
  if (look.fullArt) labels.push('Full art');
  if (look.borderless) labels.push('Borderless');
  if (look.textless) labels.push('Textless');
  for (const effect of [...look.frameEffects, ...look.promoTypes]) labels.push(WORDS[effect] ?? effect);
  return [...new Set(labels)];
}

// What the catalogue's "looks" table holds for one printing (lists are kept as comma-separated text)
export type LookRow = { full_art: number; textless: number; frame_effects: string; promo_types: string };

export function lookToRow(look: Look): LookRow {
  return {
    full_art: look.fullArt ? 1 : 0,
    textless: look.textless ? 1 : 0,
    frame_effects: look.frameEffects.join(','),
    promo_types: look.promoTypes.join(','),
  };
}

// A look from a "looks" row (none: an ordinary printing, or a catalogue without looks) and the printing's border colour
export function lookFromRow(row: Record<string, unknown> | undefined, border: string): Look {
  const list = (value: unknown) => (typeof value === 'string' ? value.split(',').filter(Boolean) : []);
  return {
    fullArt: Number(row?.full_art) === 1,
    borderless: border === 'borderless',
    textless: Number(row?.textless) === 1,
    frameEffects: list(row?.frame_effects),
    promoTypes: list(row?.promo_types),
  };
}
