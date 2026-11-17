/* =====================================================================
   GREY PICTURES FROM THE PHONE'S TEXT READER (plain TypeScript, no imports)
   The Android add-on can only hand text across to the app, so it sends a grey
   picture as its width, its height and its pixels packed into letters (base64:
   a way of writing bytes using only ordinary characters). This unpacks that
   into the same GrayPicture the website makes, and works out the average
   brightness of one, which is how the border colour is told.
   ===================================================================== */

import type { GrayPicture } from './scannerTypes';

// What the add-on sends for one grey picture
export type PackedGray = { width: number; height: number; data: string };

// Unpack it: one number from 0 to 255 for each pixel, row by row
export function decodeGray(packed: PackedGray): GrayPicture {
  const text = atob(packed.data);
  const data = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) data[i] = text.charCodeAt(i);
  return { data, width: packed.width, height: packed.height };
}

// How bright a grey picture is on average (0 black to 255 white)
export function meanBrightness(picture: GrayPicture): number {
  if (picture.data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < picture.data.length; i++) sum += picture.data[i];
  return sum / picture.data.length;
}
