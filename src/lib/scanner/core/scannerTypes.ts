/* =====================================================================
   WHAT A SCAN GIVES (shared, plain TypeScript, no imports)
   Each platform's camera (Android's and the website's) takes a picture of a
   card, reads the text in a few places on it with its own OCR, and hands this
   over. Everything after that (parsing, checking against the catalogue,
   deciding how sure it is) is the same on both and works from this.
   ===================================================================== */

export type ScanReading = {
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

// A standard card is 63 x 88 mm
export const CARD_ASPECT = 63 / 88;
