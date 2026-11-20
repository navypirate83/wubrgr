/* =====================================================================
   THE OUTLINE ROUND A TRACKED CARD (phone app)
   Track card draws a four-sided outline round the card it is following. The website draws it with one drawing shape; the
   phone app has no such shape to hand, so each of the four sides is a thin bar, placed at the middle of that side and
   turned to its angle. The corners are given as shares of the camera area (0 to 1 across and down).
   The look matches the website: white while the card is settling and thicker as the hold-still wait fills up, the accent
   colour when it is about to be scanned, and faint once the card has been scanned.
   ===================================================================== */

import { View } from 'react-native';
import type { Quad } from '@/lib/scanner/core/perspective';

// "quad": the card's corners. "area": the camera area's size in screen pixels. "hold": how far through the hold-still wait
// (0 to 1). "armed": whether the card will be scanned when the wait is over. "accent": the app's accent colour.
export default function TrackOutline({ quad, area, hold, armed, accent }: { quad: Quad; area: { w: number; h: number }; hold: number; armed: boolean; accent: string }) {
  const colour = !armed ? 'rgba(255,255,255,0.4)' : hold >= 1 ? accent : '#ffffff';
  const thick = armed ? 2 + 3 * hold : 2;
  // The corners in screen pixels
  const points = quad.map((p) => ({ x: p.x * area.w, y: p.y * area.h }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: area.w, height: area.h }}>
      {points.map((from, i) => {
        // One side: from this corner to the next one round
        const to = points[(i + 1) % points.length];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              // A bar as long as the side (plus its own thickness, so the corners meet), centred on the middle of the side
              left: (from.x + to.x) / 2 - (length + thick) / 2,
              top: (from.y + to.y) / 2 - thick / 2,
              width: length + thick,
              height: thick,
              borderRadius: thick / 2,
              backgroundColor: colour,
              transform: [{ rotate: `${angle}rad` }],
            }}
          />
        );
      })}
    </View>
  );
}
