/* =====================================================================
   GETTING A PICTURE READY FOR THE AI MODEL (shared, plain TypeScript,
   nothing phone-specific, no libraries)
   The AI model (DINOv2-small) cannot look at any old picture. It wants
   exactly this: a square picture 224 x 224 pixels, with the colours laid
   out as three separate sheets (all the reds, then all the greens, then all
   the blues), and every colour value squeezed onto the scale the model was
   trained with (take the value from 0 to 1, subtract an "average", divide
   by a "spread"). This file does that, and also helps pick WHERE on the card
   to look:
     1. TURNS: a card can be held sideways or upside down, so the picture is
        tried turned 0, 90, 180 and 270 degrees.
     2. ART BOXES: the artwork sits in a slightly different place on each
        era of card, so each era's box is tried, plus the "whole card" box
        for full-art and borderless cards.
     3. TENSOR: the box is cut out, shrunk to 224 x 224 and turned into the
        list of decimals the model reads (a "tensor" is just that list).
     4. POOLING: after the model runs it gives one list of numbers per patch
        of the picture; poolTokens boils those down to the single 768-number
        fingerprint that artEmbed.ts and the saved catalogue use.
   It matches scripts/catalogue/embed/lib.mjs and real-photos-test.mjs
   number for number (see modelInput.test.ts).
   Pictures here are "red, green, blue, alpha" rows of numbers, like the
   browser's canvas gives (the alpha, "see-through" number, is ignored).
   ===================================================================== */

import { ART_BY_ERA, type Box } from './scannerTypes.ts';

// A picture: red, green, blue, alpha for every pixel, row by row. "channels" can say 3 if there is
// no alpha number (red, green, blue only); if left out, 4 is assumed.
export type Picture = { data: ArrayLike<number>; width: number; height: number; channels?: 3 | 4 };

// What the model wants (the same numbers lib.mjs uses for DINOv2)
export const MODEL_SIZE = 224;
export const MODEL_MEAN = [0.485, 0.456, 0.406] as const;
export const MODEL_STD = [0.229, 0.224, 0.225] as const;

// The standard flat card picture the art boxes are measured on (the size the outline finder makes)
export const CARD_WIDTH = 630;
export const CARD_HEIGHT = 880;

// The four turns that are tried (clockwise degrees)
export const TURNS = [0, 90, 180, 270] as const;
export type Turn = (typeof TURNS)[number];

// The five art boxes tried: the four era boxes the app uses everywhere, and the whole card (minus a
// thin edge) for cards whose artwork runs to the edges. Each box is [left, top, right, bottom] as
// shares of the card's width and height.
export const ART_BOXES: Record<string, Box> = {
  '1993': ART_BY_ERA['1993'],
  '1997': ART_BY_ERA['1997'],
  '2003': ART_BY_ERA['2003'],
  '2015': ART_BY_ERA['2015'],
  full: [0.03, 0.03, 0.97, 0.97],
};
export const ART_BOX_NAMES = Object.keys(ART_BOXES);

// ---------------------------------------------------------------------
// TURNING A PICTURE
// ---------------------------------------------------------------------
// The picture turned clockwise by 0, 90, 180 or 270 degrees (always comes back with 4 numbers per
// pixel). A picture turned a quarter turn swaps its width and height.
export function turnPicture(pic: Picture, turn: Turn): Picture & { data: Uint8ClampedArray; channels: 4 } {
  const { width: w, height: h, data } = pic;
  const stride = pic.channels ?? 4;
  const quarter = turn === 90 || turn === 270;
  const outW = quarter ? h : w;
  const outH = quarter ? w : h;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Where this source pixel lands in the turned picture
      let nx = x;
      let ny = y;
      if (turn === 90) { nx = h - 1 - y; ny = x; }
      else if (turn === 180) { nx = w - 1 - x; ny = h - 1 - y; }
      else if (turn === 270) { nx = y; ny = w - 1 - x; }
      const from = (y * w + x) * stride;
      const to = (ny * outW + nx) * 4;
      out[to] = data[from];
      out[to + 1] = data[from + 1];
      out[to + 2] = data[from + 2];
      out[to + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH, channels: 4 };
}

// ---------------------------------------------------------------------
// MAKING A PICTURE A DIFFERENT SIZE ("lanczos" resizing, the same method
// the test script's picture library uses, so the numbers agree)
// ---------------------------------------------------------------------
// The "lanczos3" curve: how much a neighbouring pixel counts when making a new pixel
function lanczos(x: number): number {
  if (x === 0) return 1;
  if (x <= -3 || x >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

// For each new pixel along one direction: which first old pixel it uses and how much each of the
// old pixels counts. When shrinking, the curve is stretched so every old pixel is used (this is
// what keeps a big picture from looking jagged when it is made small).
function weightsFor(oldSize: number, newSize: number): { starts: Int32Array; counts: Int32Array; weights: Float32Array[] } {
  const scale = oldSize / newSize;
  const stretch = Math.max(1, scale);
  const support = 3 * stretch;
  const starts = new Int32Array(newSize);
  const counts = new Int32Array(newSize);
  const weights: Float32Array[] = [];
  for (let i = 0; i < newSize; i++) {
    const centre = (i + 0.5) * scale; // the new pixel's middle, measured on the old picture
    const first = Math.max(0, Math.floor(centre - support + 0.5));
    const last = Math.min(oldSize - 1, Math.floor(centre + support - 0.5));
    const list = new Float32Array(last - first + 1);
    let sum = 0;
    for (let k = first; k <= last; k++) {
      const wgt = lanczos((k + 0.5 - centre) / stretch);
      list[k - first] = wgt;
      sum += wgt;
    }
    for (let k = 0; k < list.length; k++) list[k] /= sum || 1;
    starts[i] = first;
    counts[i] = list.length;
    weights.push(list);
  }
  return { starts, counts, weights };
}

// Colour values kept as decimals while resizing (three per pixel: red, green, blue)
type Floats = { data: Float32Array; width: number; height: number };

// A part of a picture (a rectangle of pixels: left, top, width, height) made newWidth x newHeight,
// as red-green-blue-alpha numbers (whole numbers from 0 to 255). Pass the whole picture's size to
// resize all of it.
export function resizePicture(
  pic: Picture, part: { left: number; top: number; width: number; height: number }, newWidth: number, newHeight: number,
): Uint8ClampedArray {
  const stride = pic.channels ?? 4;
  const src = pic.data;
  // Copy the part out as decimals
  const copy = new Float32Array(part.width * part.height * 3);
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const at = ((part.top + y) * pic.width + part.left + x) * stride;
      const to = (y * part.width + x) * 3;
      copy[to] = src[at]; copy[to + 1] = src[at + 1]; copy[to + 2] = src[at + 2];
    }
  }
  const shrunk: Floats = { data: copy, width: part.width, height: part.height };
  const across = weightsFor(shrunk.width, newWidth);
  const down = weightsFor(shrunk.height, newHeight);
  // First pass: squeeze each row to the new width
  const middle = new Float32Array(shrunk.height * newWidth * 3);
  for (let y = 0; y < shrunk.height; y++) {
    for (let x = 0; x < newWidth; x++) {
      const list = across.weights[x];
      const first = across.starts[x];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < list.length; k++) {
        const at = (y * shrunk.width + first + k) * 3;
        r += shrunk.data[at] * list[k];
        g += shrunk.data[at + 1] * list[k];
        b += shrunk.data[at + 2] * list[k];
      }
      const to = (y * newWidth + x) * 3;
      middle[to] = r; middle[to + 1] = g; middle[to + 2] = b;
    }
  }
  // Second pass: squeeze the columns to the new height and round to whole numbers
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);
  for (let y = 0; y < newHeight; y++) {
    const list = down.weights[y];
    const first = down.starts[y];
    for (let x = 0; x < newWidth; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < list.length; k++) {
        const at = ((first + k) * newWidth + x) * 3;
        r += middle[at] * list[k];
        g += middle[at + 1] * list[k];
        b += middle[at + 2] * list[k];
      }
      const to = (y * newWidth + x) * 4;
      out[to] = r; out[to + 1] = g; out[to + 2] = b; out[to + 3] = 255; // (the clamped array rounds and limits to 0..255)
    }
  }
  return out;
}

// A card picture turned by "turn" and made the standard 630 x 880 (stretched to fit, as the test
// script does: a card that was sideways is turned upright, and a card cut a little loosely is
// stretched to the standard shape). Returns the picture ready for the art boxes.
export function standardCard(card: Picture, turn: Turn): Picture & { data: Uint8ClampedArray; channels: 4 } {
  const turned = turn === 0 ? card : turnPicture(card, turn);
  if (turned.width === CARD_WIDTH && turned.height === CARD_HEIGHT && (turned.channels ?? 4) === 4) {
    return turned as Picture & { data: Uint8ClampedArray; channels: 4 };
  }
  const data = resizePicture(turned, { left: 0, top: 0, width: turned.width, height: turned.height }, CARD_WIDTH, CARD_HEIGHT);
  return { data, width: CARD_WIDTH, height: CARD_HEIGHT, channels: 4 };
}

// ---------------------------------------------------------------------
// THE MODEL'S INPUT
// ---------------------------------------------------------------------
// Cut the art box out of an upright card picture (box = shares of the card's width and height) and
// turn it into the model's numbers: 3 x 224 x 224 decimals, all reds, then all greens, then all blues.
// Hand this to the model as a float32 tensor of shape [1, 3, 224, 224].
export function artTensor(card: Picture, box: Box): Float32Array {
  const [x0, y0, x1, y1] = box;
  // The same rounding the test script uses when it cuts the box out
  const left = Math.round(x0 * card.width);
  const top = Math.round(y0 * card.height);
  const width = Math.round((x1 - x0) * card.width);
  const height = Math.round((y1 - y0) * card.height);
  return pictureTensor(resizePicture(card, { left, top, width, height }, MODEL_SIZE, MODEL_SIZE));
}

// Turn a finished 224 x 224 red-green-blue-alpha picture into the model's numbers
export function pictureTensor(rgba224: ArrayLike<number>): Float32Array {
  const area = MODEL_SIZE * MODEL_SIZE;
  const floats = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    for (let c = 0; c < 3; c++) floats[c * area + i] = (rgba224[i * 4 + c] / 255 - MODEL_MEAN[c]) / MODEL_STD[c];
  }
  return floats;
}

// Everything the scanner tries on one found card: every turn x every art box (4 x 5 = 20 inputs),
// the same combinations the test script tries. The caller runs the model on each and keeps the
// one whose best match in the catalogue scores highest.
export function allArtTensors(card: Picture): { turn: Turn; boxName: string; tensor: Float32Array }[] {
  const list: { turn: Turn; boxName: string; tensor: Float32Array }[] = [];
  for (const turn of TURNS) {
    const upright = standardCard(card, turn);
    for (const boxName of ART_BOX_NAMES) list.push({ turn, boxName, tensor: artTensor(upright, ART_BOXES[boxName]) });
  }
  return list;
}

// ---------------------------------------------------------------------
// AFTER THE MODEL: ONE FINGERPRINT
// ---------------------------------------------------------------------
// Make a list of numbers exactly length 1 (so "how alike" is just multiplying two lists)
function unit(list: ArrayLike<number>, from: number, count: number): Float32Array {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += list[from + i] * list[from + i];
  const length = Math.sqrt(sum) || 1;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = list[from + i] / length;
  return out;
}

// The model's answer ("last_hidden_state") is one list of "width" numbers for each of "tokens" patches
// of the picture (the first, the "cls" one, is a summary of the whole picture). The fingerprint is the
// summary, then the average of all the other patches, each half scaled to length 1 so neither drowns
// the other: 2 x width numbers (768 for DINOv2-small). This is the form artEmbed.ts expects.
export function poolTokens(hidden: ArrayLike<number>, tokens: number, width: number): Float32Array {
  const average = new Float32Array(width);
  for (let t = 1; t < tokens; t++) for (let i = 0; i < width; i++) average[i] += hidden[t * width + i] / (tokens - 1);
  const out = new Float32Array(width * 2);
  out.set(unit(hidden, 0, width), 0);
  out.set(unit(average, 0, width), width);
  return out;
}
