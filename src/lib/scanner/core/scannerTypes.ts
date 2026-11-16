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
// line can't be read (older cards): the set symbol, the artwork, and the border colour
export type ScanExtras = {
  symbol?: GrayPicture | null;           // the crop where the set symbol is (at the right end of the type line)
  arts?: GrayPicture[];                  // the art box, cropped a few slightly different ways (the card is never lined up exactly)
  border?: 'black' | 'white' | null;     // the card's border colour, if it could be told
  artPreview?: string;                   // the art crop as a picture address, to show beside the candidates
};

export type ScanReading = {
  extras?: ScanExtras;
  infoText: string;        // the raw text of the bottom-left info line ("R 0123\nMOM • EN")
  nameText: string;        // the raw text of the title bar (the card's name)
  bottomText: string;      // the raw text of the copyright line at the very bottom
  takenAt: number;         // when (milliseconds)
  // The pictures that were actually read (as data addresses), for seeing what the scanner saw
  debug?: { info?: string; name?: string; bottom?: string };
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

// More parts, for the older-card fallback (same measurements, same frame)
export const ART_BOX: Box = [0.075, 0.105, 0.925, 0.545];
export const SYMBOL_BOX: Box = [0.82, 0.545, 0.955, 0.625];
export const BORDER_STRIP: Box = [0.0, 0.2, 0.03, 0.8];
// The art box is also cropped moved by these shares of the card's width and height, because the
// card is never lined up perfectly and a fingerprint is sensitive to that (see phash.ts)
export const ART_SHIFTS: readonly (readonly [number, number])[] = [
  [0, 0], [-0.03, 0], [0.03, 0], [0, -0.03], [0, 0.03], [-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03],
];

// A standard card is 63 x 88 mm
export const CARD_ASPECT = 63 / 88;
