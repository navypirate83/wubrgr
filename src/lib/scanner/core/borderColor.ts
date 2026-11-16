/* =====================================================================
   TELLING THE BORDER COLOUR (shared, plain TypeScript, no imports)
   Old Magic cards come with a black or a white border (the same card in
   Unlimited has a black border and in Revised a white one, say), so the border
   is a clue to which printing a card is. The camera works out the average
   brightness (0 to 255) of a thin strip along the card's edge, and this says
   what that means. Anything in between (a silver or gold border, a glossy
   photo, a card not lined up) says nothing rather than guessing.
   ===================================================================== */

export function borderFromBrightness(mean: number): 'black' | 'white' | null {
  if (mean < 70) return 'black';
  if (mean > 175) return 'white';
  return null;
}
