/* =====================================================================
   MATCHING A PHOTO'S ARTWORK WITH THE AI "FINGERPRINT" (shared, plain
   TypeScript, no imports, nothing phone-specific)
   The idea: an AI model looks at a picture and gives back a list of
   numbers (a "fingerprint", or "embedding") that describes it. Two
   pictures of the same artwork get lists that are close to each other,
   even when the photos are tilted, dim, blurry or have glare.
   Before the app existed, a computer made a fingerprint for every
   artwork in the catalogue and saved them in one file (one row of 256
   whole numbers per artwork). When you scan a card, the phone makes a
   fingerprint of the art in your photo and looks for the rows that are
   closest to it.
   This file does the plain arithmetic, in three small steps:
     1. shrinkEmbedding: the model gives 768 numbers; squeeze them to the
        same 256 the saved file uses (using a "recipe" file saved with it)
     2. similarityTo: how alike is the photo to ONE saved artwork
     3. nearest: which saved artworks are closest to the photo
   Running the AI model itself (picture in, 768 numbers out) is the part
   that depends on the phone or browser, so it lives elsewhere.
   How it was made and tested: scripts/catalogue/embed/ (the model is
   DINOv2-small; on 57,000 artworks and computer-damaged photos it put
   the right artwork first about 80% of the time).
   ===================================================================== */

// How many numbers the model gives, and how many the saved file keeps
export const FULL_WIDTH = 768;
export const KEPT_WIDTH = 256;

// The number the saved file scales each value to: whole numbers from
// -127 to 127 (one byte each), instead of decimals
const SCALE = 127;

// The "recipe" for squeezing 768 numbers into 256. It holds the average
// fingerprint (768 numbers) followed by 256 "directions" (768 numbers
// each) found when the saved file was made. This is how it is stored:
// one long list of decimals.
export function recipeSize(full = FULL_WIDTH, kept = KEPT_WIDTH): number {
  return full + kept * full;
}

// Step 1: squeeze the model's 768 numbers into the saved file's 256.
// How: subtract the average, measure how far the result points along each
// of the 256 directions, make the whole list length 1 (so only the
// "shape" counts, not how bright the photo was), and round each number
// to a whole number from -127 to 127.
// "model" is what the model gave, with its two halves (a summary of the
// whole picture, and the average of its parts) each already scaled to
// length 1.
export function shrinkEmbedding(
  model: ArrayLike<number>, recipe: Float32Array, full = FULL_WIDTH, kept = KEPT_WIDTH,
): Int8Array {
  if (model.length !== full) throw new Error(`Expected ${full} numbers from the model, got ${model.length}`);
  if (recipe.length !== recipeSize(full, kept)) throw new Error('The recipe file is the wrong size');
  const along = new Float32Array(kept);
  let lengthSquared = 0;
  for (let k = 0; k < kept; k++) {
    const start = full + k * full;
    let dot = 0;
    for (let i = 0; i < full; i++) dot += (model[i] - recipe[i]) * recipe[start + i];
    along[k] = dot;
    lengthSquared += dot * dot;
  }
  const length = Math.sqrt(lengthSquared) || 1;
  const out = new Int8Array(kept);
  for (let k = 0; k < kept; k++) out[k] = Math.round((along[k] / length) * SCALE);
  return out;
}

// Step 2: how alike are the photo and ONE saved artwork? Returns a number
// from about -1 to 1 (1 = identical shape). "row" says which artwork,
// by its place in the saved file.
export function similarityTo(photo: Int8Array, saved: Int8Array, row: number, kept = KEPT_WIDTH): number {
  let dot = 0;
  const start = row * kept;
  for (let i = 0; i < kept; i++) dot += photo[i] * saved[start + i];
  return dot / (SCALE * SCALE);
}

// Step 3: the closest saved artworks to the photo, best first. Looks at
// every row (57,000 of them takes a few milliseconds on a computer), or
// only at the rows in "only", if given (say, the artworks of one card).
// Returns pairs of (row, similarity).
export function nearest(
  photo: Int8Array, saved: Int8Array, count: number, only?: number[], kept = KEPT_WIDTH,
): { row: number; similarity: number }[] {
  const rows = only ?? Array.from({ length: Math.floor(saved.length / kept) }, (_, i) => i);
  const best: { row: number; similarity: number }[] = [];
  for (const row of rows) {
    const similarity = similarityTo(photo, saved, row, kept);
    // Keep only the best "count" seen so far
    if (best.length < count || similarity > best[best.length - 1].similarity) {
      best.push({ row, similarity });
      best.sort((a, b) => b.similarity - a.similarity);
      if (best.length > count) best.pop();
    }
  }
  return best;
}
