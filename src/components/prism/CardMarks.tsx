/* =====================================================================
   THE CARD WITH ITS MARKS
   A picture of the card with the PRISM marks drawn along its two long
   edges, like the paint you put on the inner sleeve:
     - Each slot is a thin line across the edge, half on the card and half
       sticking out past it, with its number beside it.
     - There are 24 slots on a side. The first line is level with the middle
       of the card's name box and the last is the same distance up from the
       bottom; the rest are evenly spaced between them. (The distances are
       measured from the modern card frame.)
     - Side A (slots 1 to 24) is on one edge and Side B (25 to 48) on the
       opposite edge, both showing at once.
     - The corner chosen for the set (which corner is slot 1) decides which
       edge Side A is on and whether slot 1 is at the top or the bottom.
   Each mark has a kind:
     - "paint": a mark to paint (the Mark tab): solid, in the deck's color
     - "keep":  a mark already on the sleeve that stays: solid but dimmed
     - "add":   a mark still to paint (the Changes tab): solid, with a green +
     - "remove": a mark to scrape off: a dashed outline, with a red -
   Shown large (with small ticks for the unused slots, numbered every fourth
   one, and a caption) or, when given a "width", small, for a row of a list.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useTheme';
import { pictureSource } from '@/lib/http';
import { CORNERS, SLOTS_PER_SIDE, colorForSlot, type PrismSet } from '@/lib/prismStorage';

export type MarkKind = 'paint' | 'keep' | 'add' | 'remove';
export type CardMark = { slot: number; kind: MarkKind };

type Props = {
  image: string | null;       // the card's picture (null: a plain box, for a card no deck has now)
  marks: CardMark[];          // the marks to draw (slots 1 to 48)
  corner: PrismSet['corner']; // which corner is slot 1
  width?: number;             // give this to draw it small, this wide (points); leave it out for the large one
};

// Where the first and last lines sit, as a share of the card's height: the
// middle of the name box, and the same distance up from the bottom
const FIRST_LINE = 7.65;

// The sizes (points) for the large and the small drawing: how far a line
// reaches in from the edge and out past it, the room the numbers need beside
// each edge, how thick a line is, and the number's text size
const LARGE = { reach: 16, room: 44, thick: 4, font: 11, tickFont: 10 };
const SMALL = { reach: 8, room: 26, thick: 3, font: 9.5, tickFont: 9.5 };

export default function CardMarks({ image, marks, corner, width }: Props) {
  const colors = useColors();
  const small = width !== undefined;
  const size = small ? SMALL : LARGE;

  // Side A is on the edge the corner names; Side B is on the opposite one
  const cornerName = CORNERS[corner];
  const sideAOnRight = cornerName.endsWith('right');
  // A corner at the bottom means slot 1 is at the bottom and the numbers climb upward
  const fromBottom = cornerName.startsWith('bottom');
  const kindOf = new Map(marks.map((m) => [m.slot, m.kind]));

  // The number beside a line: bold for something to do, with its + or - sign
  function numberLook(kind: MarkKind | undefined) {
    if (kind === 'add') return { color: colors.success, fontWeight: '800' as const, fontSize: size.font };
    if (kind === 'remove') return { color: colors.error, fontWeight: '800' as const, fontSize: size.font };
    if (kind === 'paint') return { color: colors.text, fontWeight: '800' as const, fontSize: size.font };
    if (kind === 'keep') return { color: colors.muted, fontWeight: '600' as const, fontSize: size.font };
    return { color: colors.muted, fontWeight: '400' as const, fontSize: size.tickFont };
  }

  // The 24 lines of one side, down one edge of the card
  function sideLines(first: number, onRight: boolean) {
    return Array.from({ length: SLOTS_PER_SIDE }, (_, i) => {
      const slot = first + i;
      const kind = kindOf.get(slot);
      // The small drawing only shows the marks themselves, not the empty slots
      if (small && !kind) return null;
      // How far down the card this slot is, as a share of its height
      const along = fromBottom ? SLOTS_PER_SIDE - 1 - i : i;
      const top = FIRST_LINE + (along / (SLOTS_PER_SIDE - 1)) * (100 - 2 * FIRST_LINE);
      const edge = onRight ? { right: -size.reach } : { left: -size.reach };
      const sign = kind === 'add' ? '+' : kind === 'remove' ? '−' : '';
      const showNumber = kind !== undefined || (!small && i % 4 === 0);
      const color = colorForSlot(slot);
      return (
        <View key={slot} pointerEvents="none" style={[styles.slot, { top: `${top}%` }]}>
          {kind === undefined ? (
            <View style={[styles.tick, onRight ? { right: -7 } : { left: -7 }, { backgroundColor: colors.muted }]} />
          ) : kind === 'remove' ? (
            // To scrape off: just the outline, dashed
            <View style={[styles.line, edge, { top: -(size.thick + 3) / 2, height: size.thick + 3, width: size.reach * 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color }]} />
          ) : (
            <View style={[styles.line, edge, { top: -size.thick / 2, height: size.thick, width: size.reach * 2, backgroundColor: color, opacity: kind === 'keep' ? 0.45 : 1 }]} />
          )}
          {showNumber && (
            <Text
              maxFontSizeMultiplier={1}
              style={[
                styles.number,
                onRight ? { left: '100%', marginLeft: size.reach + 4 } : { right: '100%', marginRight: size.reach + 4, textAlign: 'right' },
                numberLook(kind),
              ]}
            >
              {sign}{slot}
            </Text>
          )}
        </View>
      );
    });
  }

  const painted = marks.map((m) => m.slot).sort((a, b) => a - b);
  const cardStyle = small
    ? { width, aspectRatio: 63 / 88, borderRadius: 6 }
    : { width: '100%' as const, aspectRatio: 63 / 88, borderRadius: 12 };

  return (
    <View style={small ? { paddingHorizontal: size.room } : styles.wrap}>
      <View style={small ? undefined : styles.stage}>
        <View
          accessible
          accessibilityLabel={painted.length > 0
            ? `Card with its marks, slots ${painted.join(', ')}. Slot 1 is the ${cornerName} corner. Side A is on the ${sideAOnRight ? 'right' : 'left'} edge and Side B on the ${sideAOnRight ? 'left' : 'right'} edge.`
            : 'Card with no marks.'}
          style={cardStyle}
        >
          {image
            ? <Image source={pictureSource(image)} style={[StyleSheet.absoluteFill, { borderRadius: cardStyle.borderRadius }]} contentFit="cover" />
            : <View style={[StyleSheet.absoluteFill, { borderRadius: cardStyle.borderRadius, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }]} />}
          {sideLines(1, sideAOnRight)}
          {sideLines(SLOTS_PER_SIDE + 1, !sideAOnRight)}
        </View>
      </View>

      {!small && (
        <Text style={[styles.caption, { color: colors.muted }]}>
          Slot 1 is the {cornerName} corner. Side A (1 to 24) is on the {sideAOnRight ? 'right' : 'left'} edge, Side B (25 to 48) on the {sideAOnRight ? 'left' : 'right'}.
        </Text>
      )}
    </View>
  );
}

// The look: the card (a standard card's shape) with its lines, and room on both sides for the numbers
const styles = StyleSheet.create({
  wrap: { gap: 8 },
  stage: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: LARGE.room },
  // One slot: a zero-size spot on the card's edge that the line, tick and number are placed from
  slot: { position: 'absolute', left: 0, right: 0, height: 0 },
  line: { position: 'absolute', borderRadius: 1 },
  tick: { position: 'absolute', top: -0.75, width: 7, height: 1.5, opacity: 0.55 },
  number: { position: 'absolute', top: -7, width: 26, lineHeight: 14 },
  caption: { fontSize: 12, textAlign: 'center' },
});
