/* =====================================================================
   WHAT A SCAN GIVES (shared, plain TypeScript, no imports)
   Each platform's camera (Android's and the website's) takes a picture of a
   card, reads the text in a few places on it with its own OCR, and hands this
   over. Everything after that (parsing, checking against the catalogue,
   deciding how sure it is) is the same on both and works from this.
   ===================================================================== */

// A grey picture: one number from 0 to 255 for each pixel, row by row
export type GrayPicture = { data: Uint8Array; width: number; height: number };

// What the camera also works out from the photo, for telling printings apart when the info
// line can't be read (older cards): the set symbol, the artwork, and the border colour.
// The art and the symbol are each ONE picture of a generous area (ART_REGION, SYMBOL_REGION below). They are
// cut up later, once the printings to choose between are known, because each frame era (1993, 1997, 2003,
// 2015) has its art and symbol in a slightly different place (see core/clueMatch.ts).
export type ScanExtras = {
  artRegion?: GrayPicture | null;        // the art area of the card, as one grey picture
  symbolRegion?: GrayPicture | null;     // the area around the set symbol (at the right end of the type line)
  border?: 'black' | 'white' | null;     // the card's border colour, if it could be told
  artPreview?: string;                   // the art crop as a picture address, to show beside the candidates
};

export type ScanReading = {
  extras?: ScanExtras;
  infoText: string;        // the raw text of the bottom-left info line ("R 0123\nMOM • EN")
  nameText: string;        // the raw text of the title bar (the card's name)
  bottomText: string;      // the raw text of the copyright line at the very bottom
  takenAt: number;         // when (milliseconds)
  // The slower extras (the copyright line, and the symbol / artwork / border clues for older cards) are NOT read
  // up front: most cards are told apart by the info line alone. This reads them if the fallback turns out to need
  // them (see readPlan.ts). It is dropped once the reading has been worked out, so the photo can be let go.
  moreClues?: () => Promise<{ bottomText: string; extras: ScanExtras }>;
  // Only the website's camera sets this, and only while the "AI art matching" option is on: when called, it finds the
  // card in the photo with the outline finder and gives back flat, upright pictures of it (the best guesses at where
  // the card is: red, green, blue, alpha for every pixel) for the AI to look at. It does the slow work only when called,
  // and is dropped with the photo once the reading has been worked out, like moreClues.
  aiPictures?: () => Promise<{ data: ArrayLike<number>; width: number; height: number }[]>;
  // How long each step took, in milliseconds (the camera adds "photo", the reader adds "text" and so on).
  // Shown briefly after a scan so it's easy to see what is slow.
  timings?: Record<string, number>;
};

// Where the parts of a card are, as shares of the card's width and height (0 to 1):
// left, top, right, bottom. Measured on the modern card frame; the camera crops these
// out of the card's box in the photo. (Older frames differ a little.)
export type Box = readonly [number, number, number, number];
export const CARD_PARTS = {
  // the small print at the bottom left: collector number, rarity, set code, language
  // (narrow on purpose: just past the language, so the artist's name that follows isn't read as part of it)
  infoLine: [0.03, 0.885, 0.23, 0.985] as Box,
  // the card's name in the title bar
  // (stops before the mana cost on the right; keeps to the middle of the bar, away from the frame)
  name: [0.05, 0.04, 0.74, 0.095] as Box,
  // the copyright line at the very bottom, middle to right
  bottomLine: [0.3, 0.945, 0.97, 0.99] as Box,
} as const;

// The whole band across the top of the card, for finding the name on frames where it isn't in the
// same place (older frames put it a little differently): read as scattered text, then each line is matched against the names
export const NAME_BAND: Box = [0.03, 0.02, 0.85, 0.14];

// More parts, for the older-card fallback
// The art box for the small picture shown beside the candidates (the modern frame's)
export const ART_BOX: Box = [0.075, 0.105, 0.925, 0.545];
export const BORDER_STRIP: Box = [0.0, 0.2, 0.03, 0.8];

// The four frame designs the printings use (the catalogue says which one each printing has; anything
// newer than 2015 uses the 2015 one's places)
export type Era = '1993' | '1997' | '2003' | '2015';
export const eraOf = (frame: string): Era => (frame === '1993' || frame === '1997' || frame === '2003' ? frame : '2015');

// Where the art is in each frame design, matching the art the catalogue's fingerprints were made from.
// These were found by trying boxes on real scans of cards from each era and keeping the ones that gave
// the closest fingerprints (the old single box was about 60 bits off; these are about 15 to 25).
export const ART_BY_ERA: Record<Era, Box> = {
  '1993': [0.115, 0.095, 0.89, 0.54],
  '1997': [0.115, 0.1, 0.885, 0.54],
  '2003': [0.09, 0.12, 0.91, 0.555],
  '2015': [0.08, 0.115, 0.92, 0.555],
};
// Each art box is also tried moved by these shares of the card's width and height, across and down (so 5 x 5
// places), because the card is never lined up perfectly and a fingerprint is sensitive to that (see phash.ts).
// (On real scans moved and resized on purpose, 5 steps beat 3 by a lot for a card lined up a little off, and
// trying a few sizes as well added almost nothing for a lot more work.)
export const ART_SHIFT_STEPS: readonly number[] = [-0.03, -0.015, 0, 0.015, 0.03];
// The one picture of the art area the camera takes: big enough to hold every era's art box moved by every shift
export const ART_REGION: Box = [0.05, 0.065, 0.95, 0.585];

// The set symbol: a small spot at the right end of the type line, found by sliding a window around.
// (Found by locating real symbols on real scans: the middle was at about 0.887 across and 0.59 down, in every era.)
export const SYMBOL_SPOT = { x: 0.887, y: 0.59, width: 0.06, height: 0.04 } as const;
// The window is tried moved by these shares of the card's width and height (5 across, 5 down)
export const SYMBOL_OFFSETS = { x: [-0.03, -0.015, 0, 0.015, 0.03], y: [-0.02, -0.01, 0, 0.01, 0.02] } as const;
// The one picture of the symbol area the camera takes: holds the window in every one of those places
export const SYMBOL_REGION: Box = [0.82, 0.545, 0.955, 0.635];

// A standard card is 63 x 88 mm
export const CARD_ASPECT = 63 / 88;
