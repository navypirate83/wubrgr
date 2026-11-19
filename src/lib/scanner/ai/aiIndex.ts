/* =====================================================================
   THE SAVED ART FINGERPRINTS: LOOKING THINGS UP (plain TypeScript)
   The AI files include one saved fingerprint (256 small whole numbers) for
   every artwork in the catalogue, plus the list saying which artwork is which
   and the "recipe" for squeezing the model's answer down to the same size.
   This file turns those raw bytes into something the scanner can ask:
   - shrink(embedding): the model's 768 numbers -> a photo fingerprint of 256
   - similarityToIllustration(photo, artworkId): how alike is the photo to ONE
     artwork (about -1 to 1; null if that artwork has no saved fingerprint)
   - nearestArt(photo, n): the n closest artworks in the whole catalogue
   The arithmetic itself is in core/artEmbed.ts; this is the bookkeeping
   (which row is which artwork) around it. It does not read any files itself:
   whoever loads the bytes (see aiRun.ts) hands them in, which also lets tests
   use small made-up data.
   ===================================================================== */

import { FULL_WIDTH, KEPT_WIDTH, nearest, recipeSize, shrinkEmbedding, similarityTo } from '../core/artEmbed.ts';

// What the index can do
export type AiIndex = {
  rows: number;                                                  // how many artworks have a saved fingerprint
  shrink(embedding: ArrayLike<number>): Int8Array;
  similarityToIllustration(photo: Int8Array | Float32Array, illustrationId: string): number | null;
  nearestArt(photo: Int8Array | Float32Array, count: number): { illustrationId: string; similarity: number }[];
};

// Make the index from the raw bytes of the three files.
// "vectors": one row of 256 whole numbers (-127 to 127) per artwork, one byte each.
// "idsText": the artworks' ids, one per line, in the same order as the rows.
// "projection": the recipe, as decimals (4 bytes each): 768 averages then 256 rows of 768 directions.
export function createAiIndex(vectors: Uint8Array, idsText: string, projection: Uint8Array): AiIndex {
  // The numbers in the vectors file are signed (-127 to 127), so look at the same bytes that way
  const saved = new Int8Array(vectors.buffer, vectors.byteOffset, vectors.byteLength);
  const ids = idsText.split('\n').map((line) => line.trim()).filter(Boolean);
  if (saved.length % KEPT_WIDTH !== 0 || saved.length / KEPT_WIDTH !== ids.length) {
    throw new Error('The AI fingerprint file and its list of artworks do not match');
  }
  if (projection.byteLength !== recipeSize() * 4) throw new Error('The AI recipe file is the wrong size');
  // The recipe as decimals. They have to start on a multiple of 4 bytes to be read in place; if they don't, copy them.
  const aligned = projection.byteOffset % 4 === 0 ? projection : projection.slice();
  const recipe = new Float32Array(aligned.buffer, aligned.byteOffset, recipeSize());
  const rowOf = new Map(ids.map((id, row) => [id, row]));

  // A photo fingerprint may come as the model's 768 numbers; shrink those, and use 256 ones as they are
  const toPhoto = (value: Int8Array | Float32Array): Int8Array => {
    if (value.length === FULL_WIDTH) return shrinkEmbedding(value, recipe);
    if (value.length === KEPT_WIDTH && value instanceof Int8Array) return value;
    throw new Error(`A fingerprint of ${value.length} numbers is not one the AI index understands`);
  };

  return {
    rows: ids.length,
    shrink: (embedding) => shrinkEmbedding(embedding, recipe),
    similarityToIllustration(photo, illustrationId) {
      const row = rowOf.get(illustrationId);
      return row === undefined ? null : similarityTo(toPhoto(photo), saved, row);
    },
    nearestArt(photo, count) {
      return nearest(toPhoto(photo), saved, count).map((hit) => ({ illustrationId: ids[hit.row], similarity: hit.similarity }));
    },
  };
}
