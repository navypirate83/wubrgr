/* =====================================================================
   LIVE CAMERA FRAMES: THE SUMS AND SAFETY RULES (plain TypeScript, no imports of its own
   except one small helper; used by the Android scanner camera)
   Instead of taking a full photo for every "is there a card?" look, the Android camera can
   borrow a picture from the live preview (a "frame"). A frame is smaller and rougher than a
   photo, and it arrives through a brand new piece of code that has not been tried on a phone,
   so everything here is about being careful:
     - how big a picture must be before the small print on a card can still be read;
     - the sizes the camera is asked for (photos and frames);
     - checking a frame has the same shape as the photos (so the guide lines up);
     - turning a frame upright (there is a known mix-up in the camera library's own turning);
     - checking against a real photo that the frame is the right way up;
     - giving up on frames after repeated trouble, so the scanner falls back to photos.
   Nothing here touches the camera: it is all sums, so it can be tested on a computer
   (see liveFrames.test.ts).
   ===================================================================== */

import { signatureDifference } from './frameChange.ts';

/* ----- how big must a picture be? ----- */

// A real card is 63 mm wide
export const CARD_WIDTH_MM = 63;
// The height of a capital letter in the card's small print (the info line: collector number, set code, language)
// and in its title. These are careful estimates from real cards, not measurements of every card.
export const INFO_CAP_MM = 1.6;
export const TITLE_CAP_MM = 2.6;
// The smallest capital letter, in pixels, that Google's reader (ML Kit) is told to expect: its own advice is about
// 16 pixels per character. (A lower-case letter is about 70% as tall, so this is roughly a 11 pixel x-height,
// a little above the 8 pixels that reading needs at the very least.)
export const MIN_CAP_PX = 16;

// How tall a capital letter comes out, in pixels, in a picture "imageWidthPx" wide where the card is
// "cardShare" of the picture's width (for example 0.74) and the letters are "capMm" tall on the real card.
export function capHeightPx(imageWidthPx: number, cardShare: number, capMm: number): number {
  const pixelsPerMm = (imageWidthPx * cardShare) / CARD_WIDTH_MM;
  return pixelsPerMm * capMm;
}

// True when the text of that size is big enough to read in this picture
export function bigEnoughFor(imageWidthPx: number, cardShare: number, capMm: number, minPx: number = MIN_CAP_PX): boolean {
  return capHeightPx(imageWidthPx, cardShare, capMm) >= minPx;
}

/* ----- the sizes the camera is asked for ----- */

// The still photo asked for, as width x height of the upright photo (the camera gives the nearest size it has in the
// same 4:3 shape). It used to be 2448 x 3264 (about 8 megapixels). Working it through:
//   the card takes about 74% of the photo's width (the guide is 82% of the screen width and the photo is a little
//   wider than the screen), so at 1944 pixels wide the card is about 1440 pixels wide: 22.8 pixels for every
//   millimetre of the card. The info line's capital letters (1.6 mm) are then about 36 pixels tall: more than twice
//   the 16 pixels reading needs. (At the old size they were 46.) So this size is plenty, with about 38% fewer pixels
//   for the phone to make, save and open.
// If a later test shows small print still reads well, 1536 x 2048 is the next step down (capitals about 29 pixels).
export const PHOTO_TARGET = { width: 1944, height: 2592 } as const;

// The live frame asked for (upright, 3:4 like the photo, so it sees the same view and the guide lines up). The phone
// gives the nearest size it is allowed to give for a live frame; many phones cap this near 1080 pixels wide.
// At 1080 wide the card is about 800 pixels wide, 12.7 pixels per millimetre, so the info line's capitals are
// about 20 pixels tall: readable, but with much less to spare than a photo, which is why the real reading of a
// card is done from a photo unless READ_CARDS_FROM_FRAMES is switched on (see ScannerCamera.native.tsx).
export const FRAME_TARGET = { width: 1440, height: 1920 } as const;

/* ----- is the frame the right shape? ----- */

// True when two pictures have the same shape (width divided by height) to within "tolerance", counting a tall
// picture and a wide one as different. This catches a frame that came out sideways, or a different view from
// the photo's (then the guide would not line up with the card).
export function sameShape(a: { w: number; h: number }, b: { w: number; h: number }, tolerance = 0.04): boolean {
  if (!(a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0)) return false;
  const first = a.w / a.h;
  const second = b.w / b.h;
  return Math.abs(first - second) / second <= tolerance;
}

/* ----- turning a frame upright ----- */

// The camera library hands a frame over with a note of how its pixels are turned ("orientation"), and its own
// "frame to picture" step turns the picture by a number of degrees worked out from that note. Reading the library's
// code (react-native-vision-camera 5.2.4, Android): the camera (CameraX) says "turn this clockwise by D degrees to
// make it upright", the library names that note left (D = 90), down (180), right (270) or up (0) and then turns the
// picture by the NAME's own number: up 0, down 180, right 90, left 270. For up and down the two agree. For left
// and right they are opposite, so a typical phone held upright (D = 90, "left") gets turned by 270 instead of 90 and
// ends up upside down. This gives the extra turn, in degrees, that puts it right: 180 for left and right, 0 for the rest.
// (The camera then also checks this against a real photo, see judgeFrameTurn, in case this reading of the code is wrong.)
export type FrameOrientation = 'up' | 'down' | 'left' | 'right';
export function extraTurnForConverter(orientation: FrameOrientation | string): 0 | 180 {
  return orientation === 'left' || orientation === 'right' ? 180 : 0;
}

// The turn to apply to the converted picture: the library's mix-up fixed (above) and, if the photo check found the
// frame upside down anyway, one more half turn. Always 0 or 180.
export function totalTurn(orientation: FrameOrientation | string, checkedExtra: 0 | 180): 0 | 180 {
  return (extraTurnForConverter(orientation) + checkedExtra) % 360 === 0 ? 0 : 180;
}

/* ----- checking the frame against a real photo ----- */

// What the check found
export type TurnVerdict = 'upright' | 'upside-down' | 'unsure';

// A picture turned half a turn is the same numbers in reverse order (the signatures are grids read row by row)
const reversed = (signature: ArrayLike<number>): number[] => Array.from(signature).reverse();

// How much the numbers of a signature vary (a flat grey scene has none, and can't tell up from down)
function spread(signature: ArrayLike<number>): number {
  if (signature.length === 0) return 0;
  let mean = 0;
  for (let i = 0; i < signature.length; i++) mean += signature[i];
  mean /= signature.length;
  let total = 0;
  for (let i = 0; i < signature.length; i++) total += Math.abs(signature[i] - mean);
  return total / signature.length;
}

// The frame has to have this much pattern in it (average distance from its own average brightness, 0 to 255)
const MIN_SPREAD = 12;
// One way up has to match the photo this much better than the other way
const MIN_MARGIN = 0.03;
// ...and the better one has to be a decent match at all (0 = identical)
const MAX_BEST_DIFFERENCE = 0.3;

// Compare the tiny signature of a frame with the tiny signature of a real photo of the same scene taken moments
// apart (both of the guide area, see core/frameChange.ts). If the frame matches the photo better turned half a turn,
// it is upside down. When the scene has too little in it to tell (an empty table), or neither way matches well,
// the answer is "unsure" and the check is simply tried again later.
export function judgeFrameTurn(frameSignature: ArrayLike<number> | null, photoSignature: ArrayLike<number> | null): TurnVerdict {
  if (!frameSignature || !photoSignature || frameSignature.length === 0 || frameSignature.length !== photoSignature.length) return 'unsure';
  if (spread(frameSignature) < MIN_SPREAD || spread(photoSignature) < MIN_SPREAD) return 'unsure';
  const asIs = signatureDifference(frameSignature, photoSignature);
  const turned = signatureDifference(reversed(frameSignature), photoSignature);
  if (Math.min(asIs, turned) > MAX_BEST_DIFFERENCE) return 'unsure';
  if (Math.abs(asIs - turned) < MIN_MARGIN) return 'unsure';
  return asIs < turned ? 'upright' : 'upside-down';
}

/* ----- how far the frame path is trusted ----- */

// What the camera remembers about whether frames can be used. "checkedExtra" is null until a photo check has
// settled which way up frames come out, then 0 (right as they are) or 180 (they need a half turn more).
// "unsure" counts checks that couldn't tell; "fails" counts frames that could not be had in a row;
// "off" is true once the frame path has been given up for this camera session (photos are used instead).
export type FrameTrust = { checkedExtra: 0 | 180 | null; unsure: number; fails: number; off: boolean };

export const NEW_TRUST: FrameTrust = { checkedExtra: null, unsure: 0, fails: 0, off: false };

// Give up after this many frames in a row that could not be had or were the wrong shape
export const MAX_FAILS = 3;
// Give up after this many checks that couldn't tell which way up the frames are
export const MAX_UNSURE = 8;

// After trying to get a frame: success clears the run of failures, failure adds one (and gives up at the limit)
export function trustAfterGrab(trust: FrameTrust, ok: boolean): FrameTrust {
  if (ok) return trust.fails === 0 ? trust : { ...trust, fails: 0 };
  const fails = trust.fails + 1;
  return { ...trust, fails, off: trust.off || fails >= MAX_FAILS };
}

// After a photo check: a clear answer settles the turn; "unsure" is counted and gives up at the limit
export function trustAfterCheck(trust: FrameTrust, verdict: TurnVerdict): FrameTrust {
  if (verdict === 'upright') return { ...trust, checkedExtra: 0, unsure: 0 };
  if (verdict === 'upside-down') return { ...trust, checkedExtra: 180, unsure: 0 };
  const unsure = trust.unsure + 1;
  return { ...trust, unsure, off: trust.off || unsure >= MAX_UNSURE };
}

// Whether frames may be used for a look right now: not given up, and the way up has been checked
export const framesReady = (trust: FrameTrust): boolean => !trust.off && trust.checkedExtra !== null;
// Whether a photo check is still wanted (not given up, not yet settled)
export const needsCheck = (trust: FrameTrust): boolean => !trust.off && trust.checkedExtra === null;
