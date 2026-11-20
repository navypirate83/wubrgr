/* =====================================================================
   FINDING AND CUTTING OUT THE CARD IN A PHONE PHOTO: THE SMALL SUMS (plain TypeScript, no camera, no text reader)
   The phone app used to read the card from a fixed box (the guide on the screen, or the middle of a chosen photo). A card that
   is tilted, off-centre, smaller than the guide, or in a photo picked from the gallery was then read from the wrong place.
   Now, when the first read from the box makes little sense, the app also looks for the card in the photo (the same edge-and-shape
   finder the website uses), cuts it out flat with the phone add-on (flattenCard, in Kotlin), and reads that instead. These are the
   pieces of that which need no phone:
     - grayToRgba: the add-on hands over a GREY picture of the photo; the finder wants red, green, blue, alpha, so grey is copied into all three;
     - cutOutTries: the four ways to cut one find out, in the order to try them (as found, with the border put back, and both turned
       upside down, because the finder cannot tell top from bottom; see cardCuts.ts for why the border may be missing);
     - flatHeight: how tall the flat picture should be (as tall as the card looked, never tiny or huge).
   ===================================================================== */

import type { Quad, RgbaPicture } from './perspective.ts';
import { longestSide } from './perspective.ts';
import { widenToWholeCard } from './cardCuts.ts';
import type { GrayPicture } from './scannerTypes.ts';

// A grey picture as a red-green-blue-alpha one (every pixel's grey is used as its red, green and blue)
export function grayToRgba(gray: GrayPicture): RgbaPicture {
  const data = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0; i < gray.data.length; i++) {
    const v = gray.data[i];
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width: gray.width, height: gray.height };
}

// The same card turned upside down: the corners start from the opposite one
const upsideDown = (q: Quad): Quad => [q[2], q[3], q[0], q[1]];

// The ways to cut one find out of the photo, in the order to try them. Each is four corners as shares of the upright photo.
export function cutOutTries(found: Quad): Quad[] {
  const wide = widenToWholeCard(found);
  return [found, wide, upsideDown(found), upsideDown(wide)];
}

// How tall (in pixels) the flat card picture is made: about as tall as the card looked in the photo, but never tiny or enormous.
// "photo" is the upright photo's size in pixels; the corners are shares of it.
export function flatHeight(quad: Quad, photo: { w: number; h: number }): number {
  const inPixels = quad.map((p) => ({ x: p.x * photo.w, y: p.y * photo.h })) as Quad;
  return Math.max(700, Math.min(1500, Math.round(longestSide(inPixels))));
}

// The four corners as eight plain numbers (x then y, one corner after another), the shape the add-on takes
export function quadNumbers(quad: Quad): number[] {
  return quad.flatMap((p) => [p.x, p.y]);
}
