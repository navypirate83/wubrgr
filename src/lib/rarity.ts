/* =====================================================================
   THE COLOR OF A SET'S SYMBOL FOR EACH RARITY
   Red for mythic, gold for rare, silver for uncommon, black for common
   (shown light on the dark theme, where black can't be seen) and purple
   for special. A card with no rarity saved gets the quiet gray.
   ===================================================================== */

import type { Colors } from '@/theme/colors';

export function rarityColor(rarity: string | undefined, colors: Colors, dark: boolean): string {
  switch ((rarity ?? '').toLowerCase()) {
    case 'mythic': return '#e0452b';
    case 'rare': return '#d9a521';
    case 'uncommon': return '#aeb4bd';
    case 'common': return dark ? colors.text : '#000000';
    case 'special': case 'bonus': return '#9b5de5';
    default: return colors.muted;
  }
}
