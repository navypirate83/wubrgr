/* =====================================================================
   WHERE THE CARD IS IN A PHOTO (plain TypeScript, no imports, used by the phone app)
   The phone's camera screen shows the live picture "zoomed to fill" the screen,
   so the edges of the picture are cut off on the screen but still there in the
   photo. The card-shaped guide is drawn on the SCREEN, so before the text
   reader can look at the photo, we have to work out which part of the PHOTO is
   under the guide. These small functions do that sum. The answers are shares
   of the photo's width and height (0 to 1), so they work at any photo size.
   ===================================================================== */

// A box: where its left and top are, and how wide and tall it is
export type Rect = { x: number; y: number; w: number; h: number };

// The same box as shares of a bigger picture (0 to 1 from left to right and top to bottom)
export type Fractions = [x: number, y: number, w: number, h: number];

// The box on the screen (the guide) as shares of the photo.
// "area" is the camera area on the screen, "photo" is the photo's size in pixels
// (after turning it upright). The picture fills the area and the overflow is cut off ("cover").
export function guideInPhoto(area: { w: number; h: number }, guide: Rect, photo: { w: number; h: number }): Fractions {
  // How much the photo was enlarged to fill the screen area (the bigger of the two needs)
  const scale = Math.max(area.w / photo.w, area.h / photo.h);
  // How much of the photo hangs off each side of the area (it's centred)
  const offsetX = (area.w - photo.w * scale) / 2;
  const offsetY = (area.h - photo.h * scale) / 2;
  return clampBox([
    (guide.x - offsetX) / scale / photo.w,
    (guide.y - offsetY) / scale / photo.h,
    guide.w / scale / photo.w,
    guide.h / scale / photo.h,
  ]);
}

// For a photo picked from the gallery: the card is the whole photo if it's card-shaped,
// otherwise the biggest card-shaped box in the middle of it
export function cardInPickedPhoto(photo: { w: number; h: number }, cardAspect: number): Fractions {
  const shaped = Math.abs(photo.w / photo.h - cardAspect) < 0.06;
  if (shaped) return [0, 0, 1, 1];
  // The tallest card-shaped box that fits, in pixels
  const h = Math.min(photo.h, photo.w / cardAspect);
  const w = h * cardAspect;
  return [(photo.w - w) / 2 / photo.w, (photo.h - h) / 2 / photo.h, w / photo.w, h / photo.h];
}

// Keep a box inside the photo (a guide can hang a little off the edge)
export function clampBox(box: Fractions): Fractions {
  const left = Math.max(0, Math.min(1, box[0]));
  const top = Math.max(0, Math.min(1, box[1]));
  const right = Math.max(0, Math.min(1, box[0] + box[2]));
  const bottom = Math.max(0, Math.min(1, box[1] + box[3]));
  return [left, top, right - left, bottom - top];
}

// A point as shares of a picture (0 to 1 across and down)
export type SharePoint = { x: number; y: number };

// Four corners seen on the SCREEN (as shares of the camera area) worked out as shares of the PHOTO: the same sum as guideInPhoto,
// for each corner. Used by Track card in the phone app, which follows the card in the live picture on the screen and then has to
// find those same corners in the full photo. A corner a little outside the photo is kept at its edge.
export function viewQuadInPhoto<Q extends readonly SharePoint[]>(area: { w: number; h: number }, quad: Q, photo: { w: number; h: number }): Q {
  const scale = Math.max(area.w / photo.w, area.h / photo.h);
  const offsetX = (area.w - photo.w * scale) / 2;
  const offsetY = (area.h - photo.h * scale) / 2;
  const inside = (share: number) => Math.max(0, Math.min(1, share));
  return quad.map((p) => ({
    x: inside((p.x * area.w - offsetX) / scale / photo.w),
    y: inside((p.y * area.h - offsetY) / scale / photo.h),
  })) as unknown as Q;
}
