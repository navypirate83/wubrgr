/* =====================================================================
   THE CARD SCREEN (what opens when you tap a card)
   One screen for a card in a binder, a list or a deck, so all three look
   and work the same (each page used to build its own small pop-up).
   - On a phone it slides up from the bottom as a sheet.
   - On a wide window (a tablet or the website) it opens as a panel down
     the right side, with the card on the left and its details beside it.
   What's in it, top to bottom:
   - the card's name, where it is (the page gives that line) and a Foil tag
   - the card's picture (tap it to open the card in the Card Finder)
   - how many copies, with − and +
   - anything extra the page wants to add (the deck's "printings you own")
   - the big "Open in Card Finder" button
   - the page's own actions (Move, Remove...), with the red delete one last
   - "Show rules", folded away until you tap it (see CardRules.tsx)
   The page decides what each button does; this screen only draws them.
   ===================================================================== */

import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { pictureSource } from '@/lib/http';
import type { BinderCard } from '@/lib/binderStorage';
import { RADIUS } from '@/theme/colors';
import Button from '@/components/Button';
import CardRules from '@/components/binder/CardRules';

// One of the page's own buttons (Move, Remove...)
export type CardScreenAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  kind?: 'secondary' | 'danger';   // "danger" (red) goes last, on its own row
};

// The copies control: how many, the most allowed, and what − and + do
export type CardScreenCopies = {
  count: number;
  max: number;
  onLess: () => void;
  onMore: () => void;
  lessLabel: string;               // what a screen reader says for − (it can mean "delete" at one copy)
};

type Props = {
  card: BinderCard;
  subtitle?: string;               // under the name: where the card is
  copies?: CardScreenCopies;       // leave out for a card that is always one (a commander)
  onOpenFinder: () => void;
  onClose: () => void;
  actions: CardScreenAction[];
  children?: ReactNode;            // extra things the page wants to show
};

// A card's shape (63 wide, 88 tall) and how big its picture is drawn
const CARD_RATIO = 63 / 88;
const PICTURE_NARROW = 190;
const PICTURE_WIDE = 230;

export default function CardScreen({ card, subtitle, copies, onOpenFinder, onClose, actions, children }: Props) {
  const colors = useColors();
  // A wide window (the side menu is showing) gets the side panel; a phone gets the sheet
  const wide = useMenuStyle() !== 'none';

  // The card's picture. Tapping it opens the card in the Card Finder.
  const picture = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${card.name} in the Card Finder`}
      onPress={onOpenFinder}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Image
        source={pictureSource(card.image)}
        style={{ width: wide ? PICTURE_WIDE : PICTURE_NARROW, aspectRatio: CARD_RATIO, borderRadius: 12 }}
        contentFit="contain"
      />
    </Pressable>
  );

  // Everything else: copies, extras, the Card Finder button, the page's buttons, the rules
  const normalActions = actions.filter((action) => action.kind !== 'danger');
  const dangerActions = actions.filter((action) => action.kind === 'danger');
  const details = (
    <View style={[styles.details, wide && styles.detailsWide]}>
      {/* How many copies: − and + */}
      {copies && (
        <View style={[styles.copies, { backgroundColor: colors.surfaceHover }]}>
          <Pressable
            accessibilityRole="button" accessibilityLabel={copies.lessLabel} onPress={copies.onLess}
            style={({ pressed }) => [styles.round, { backgroundColor: colors.surface }, pressed && styles.pressed]}
          >
            <Ionicons name="remove" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.copiesMiddle}>
            <Text style={[styles.copiesNumber, { color: colors.text }]}>{copies.count}</Text>
            <Text style={[styles.copiesWord, { color: colors.muted }]}>{copies.count === 1 ? 'copy' : 'copies'}</Text>
          </View>
          <Pressable
            accessibilityRole="button" accessibilityLabel="One more copy" accessibilityState={{ disabled: copies.count >= copies.max }}
            disabled={copies.count >= copies.max} onPress={copies.onMore}
            style={({ pressed }) => [styles.round, { backgroundColor: colors.surface }, pressed && styles.pressed, copies.count >= copies.max && styles.dimmed]}
          >
            <Ionicons name="add" size={22} color={colors.text} />
          </Pressable>
        </View>
      )}

      {/* Whatever the page wants to add here */}
      {children}

      {/* The way to the full card lookup */}
      <Button label="Open in Card Finder" icon="search-outline" kind="primary" onPress={onOpenFinder} />

      {/* The page's own buttons, then the red one on its own */}
      {normalActions.length > 0 && (
        <View style={styles.actions}>
          {normalActions.map((action) => (
            <Button key={action.label} label={action.label} icon={action.icon} kind="secondary" onPress={action.onPress} />
          ))}
        </View>
      )}
      {dangerActions.map((action) => (
        <Button key={action.label} label={action.label} icon={action.icon} kind="danger" onPress={action.onPress} />
      ))}

      {/* The rules, folded away until asked for */}
      <CardRules card={card} />
    </View>
  );

  return (
    // "transparent" lets the dimmed page show around the screen; onRequestClose is Android's Back button
    <Modal transparent animationType={wide ? 'fade' : 'slide'} visible onRequestClose={onClose}>
      <View style={styles.fill}>
        {/* The dimmed area: tapping it closes the screen */}
        <Pressable style={[styles.backdrop, { backgroundColor: wide ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.55)' }]}
                   onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />

        {/* Where the screen sits: the right edge on a wide window, the bottom on a phone
            (pointerEvents "box-none" lets taps beside it reach the dimmed area) */}
        <View style={wide ? styles.sideWrap : styles.bottomWrap} pointerEvents="box-none">
          <View
            style={[
              wide ? styles.panel : styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow },
            ]}
            accessibilityViewIsModal
            aria-modal
          >
            {/* The name, where it is, and the close button */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={2} accessibilityRole="header">{card.name}</Text>
                {(subtitle || card.foil) && (
                  <View style={styles.subRow}>
                    {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
                    {card.foil ? (
                      <View style={[styles.foilTag, { borderColor: colors.accent }]}>
                        <Text style={[styles.foilText, { color: colors.accent }]}>Foil</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}
                style={({ pressed }) => [styles.round, { backgroundColor: colors.surfaceHover }, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* The body scrolls if it's taller than the screen. Wide: picture left, details right. Phone: one column. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={wide ? styles.bodyWide : styles.bodyNarrow}>
              <View style={wide ? undefined : styles.pictureCenter}>{picture}</View>
              {details}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// The look: a dimmed backdrop, then either a panel down the right side
// (wide) or a sheet along the bottom (phone), with rounded corners
const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  sideWrap: { flex: 1, alignItems: 'flex-end' },
  bottomWrap: { flex: 1, justifyContent: 'flex-end' },
  panel: { width: 600, maxWidth: '100%', height: '100%', borderLeftWidth: 1, padding: 20, gap: 14 },
  sheet: {
    width: '100%', maxHeight: '92%', borderTopWidth: 1,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24, gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 22, fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  subtitle: { fontSize: 13 },
  foilTag: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  foilText: { fontSize: 12, fontWeight: '700' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, paddingBottom: 8 },
  bodyNarrow: { gap: 14, paddingBottom: 8 },
  pictureCenter: { alignItems: 'center' },
  // The details column: on the wide panel it takes the room beside the picture
  // (on a phone it just stacks under the picture, so it must not use flex: 1,
  // which would squash it to nothing inside the scrolling area)
  details: { minWidth: 0, gap: 12 },
  detailsWide: { flex: 1 },
  copies: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: RADIUS * 1.4, padding: 6 },
  copiesMiddle: { alignItems: 'center' },
  copiesNumber: { fontSize: 22, fontWeight: '700' },
  copiesWord: { fontSize: 12 },
  actions: { gap: 8 },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
});
