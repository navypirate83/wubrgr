/* =====================================================================
   SMALL MADE-UP DATA FOR THE AI TESTS (not a test itself)
   A "recipe" and fake model answers simple enough to check by eye.
   ===================================================================== */

import { FULL_WIDTH, KEPT_WIDTH, recipeSize } from '../core/artEmbed.ts';

// A recipe that keeps the first 256 of the model's 768 numbers as they are: an average of all zeros,
// and direction k pointing straight along number k
export function simpleRecipe(): Uint8Array {
  const recipe = new Float32Array(recipeSize());
  for (let k = 0; k < KEPT_WIDTH; k++) recipe[FULL_WIDTH + k * FULL_WIDTH + k] = 1;
  return new Uint8Array(recipe.buffer);
}

// A made-up model answer that points along number "k" only (the rest zero)
export function pointing(k: number): Float32Array {
  const out = new Float32Array(FULL_WIDTH);
  out[k] = 1;
  return out;
}
