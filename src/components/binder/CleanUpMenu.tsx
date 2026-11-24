/* =====================================================================
   THE CLEAN-UP BUTTON AND ITS MENU (Binder view)
   The small "Clean-up" button in the Binder view (the open binder with its
   pockets). Tapping it drops a menu down from the button:
     - "Just close the gaps" (at the top): every card moves forward to fill
       the empty pockets and keeps its order. Greyed out when there are no
       gaps to close.
     - "Close the gaps and arrange by": the same ways to sort that the List
       and Grid views have (name, price, price change, color, set...). The
       cards are put in that order, filling pocket 1, 2, 3 and so on.
   Choosing one calls "onPick" with 'gaps' or the name of the sort. What
   happens next (moving the cards, and the Undo) is up to the screen.
   The two price sorts are greyed out until the prices have arrived, because
   a card with no price yet would wrongly be put last.
   ===================================================================== */

import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { BINDER_SORTS, type BinderSort } from '@/lib/binderSort';
import { RADIUS } from '@/theme/colors';

// What was chosen: just close the gaps, or arrange by one of the sorts
export type CleanUpChoice = 'gaps' | BinderSort;

type Props = {
  canCloseGaps: boolean;     // are there empty pockets with cards after them?
  pricesReady: boolean;      // have the prices arrived? (the price sorts need them)
  onPick: (choice: CleanUpChoice) => void;
};

export default function CleanUpMenu({ canCloseGaps, pricesReady, onPick }: Props) {
  const colors = useColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // The button (measured, so the menu can drop down right under it) and where the menu is (null: closed)
  const button = useRef<ComponentRef<typeof View>>(null);
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  function openMenu() {
    button.current?.measureInWindow((x, y, width, height) => {
      setMenu({ top: y + height + 4, right: Math.max(8, windowWidth - (x + width)) });
    });
  }
  // Pick one: close the menu, then tell the screen
  function pick(choice: CleanUpChoice) {
    setMenu(null);
    onPick(choice);
  }

  // One row of the menu
  const row = (key: string, label: string, choice: CleanUpChoice, icon: keyof typeof Ionicons.glyphMap, enabled: boolean, hint?: string) => (
    <Pressable
      key={key}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => pick(choice)}
      style={({ pressed }) => [styles.option, !enabled && styles.faded, pressed && { backgroundColor: colors.surfaceHover }]}
    >
      <Ionicons name={icon} size={18} color={colors.muted} />
      <View style={styles.optionName}>
        <Text style={[styles.optionText, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.optionHint, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <>
      <View ref={button} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clean-up"
          accessibilityHint="Opens a menu: close the gaps, or arrange the cards"
          accessibilityState={{ expanded: menu !== null }}
          onPress={openMenu}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.muted} />
          <Text style={[styles.label, { color: colors.muted }]}>Clean-up</Text>
          <Ionicons name="chevron-down" size={12} color={colors.muted} />
        </Pressable>
      </View>

      {/* THE MENU: a see-through layer over the screen (tap it to close the menu) with the menu on it */}
      <Modal visible={menu !== null} transparent animationType="none" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)} accessibilityLabel="Close the clean-up menu" />
        {menu && (
          <View
            accessibilityRole="menu"
            style={[styles.menu, { top: menu.top, right: menu.right, maxHeight: Math.max(200, windowHeight - menu.top - 12), backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }]}
          >
            <ScrollView>
              {row('gaps', 'Just close the gaps', 'gaps', 'sparkles-outline', canCloseGaps, canCloseGaps ? 'Keeps the order you have' : 'There are no gaps')}
              <View style={[styles.heading, { borderTopColor: colors.border }]}>
                <Text style={[styles.headingText, { color: colors.muted }]}>Close the gaps and arrange by</Text>
              </View>
              {BINDER_SORTS.map((sort) => {
                const needsPrices = sort.value === 'price' || sort.value === 'change';
                const enabled = !needsPrices || pricesReady;
                return row(sort.value, sort.name, sort.value, 'swap-vertical', enabled, enabled ? undefined : 'Loading prices…');
              })}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

// The look: the same small rounded button as the others; the menu floats over everything
const styles = StyleSheet.create({
  button: { height: 30, paddingHorizontal: 10, borderRadius: RADIUS - 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  faded: { opacity: 0.4 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: { position: 'absolute', minWidth: 250, borderWidth: 1, borderRadius: RADIUS, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  optionName: { flex: 1, flexShrink: 1 },
  optionText: { fontSize: 15 },
  optionHint: { fontSize: 11, marginTop: 1 },
  heading: { paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth },
  headingText: { fontSize: 12, fontWeight: '700' },
});
