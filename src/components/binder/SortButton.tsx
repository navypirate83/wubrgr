/* =====================================================================
   THE SORT BUTTON
   A small button that shows the sort in use and drops a menu down from
   itself listing every way to sort. Tapping an option sorts that way and
   closes the menu; tapping the one already in use reverses it (price highest
   first, then lowest first...), for the sorts that can be reversed. Tapping
   anywhere else closes the menu.
   It's used by the ViewSwitch (inside an opened binder, list or deck) and by
   PRISM's Cards tab, each with its own list of sorts and its own remembered
   choice (the screen says what to do when one is picked).
   The button is kept small so the buttons beside it all fit on one line: it shows
   just a little picture that suits the sort in use (a price tag for price, a
   paint palette for colour...), a tiny arrow when the sort can be reversed (down
   in its usual order, up when reversed) and the drop-down arrow. The menu shows
   the same pictures beside each name, and the full name is read out for screen readers.
   ===================================================================== */

import { useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { RADIUS } from '@/theme/colors';

// A picture for each way to sort, chosen to fit its name. A sort that isn't listed gets the plain
// up-and-down arrows.
type IconName = ComponentProps<typeof Ionicons>['name'];
const SORT_ICONS: Record<string, IconName> = {
  name: 'text',                  // the letters of the name
  added: 'add-circle',           // when a card was added
  price: 'pricetag',             // a price tag
  color: 'color-palette',        // a paint palette
  set: 'albums',                 // the sets, like a row of albums
  type: 'shapes',                // different kinds of shape
  rarity: 'diamond',             // a gem: the rarer the better
  value: 'water',                // a drop, like a mana symbol
  shared: 'copy',               // a card that appears more than once
  decks: 'layers',               // a pile of decks
  mine: 'hand-left',             // put in order by hand
  used: 'time',                  // when it was last opened
  made: 'sparkles',              // brand new
  cards: 'file-tray-full',       // a full tray of cards
  format: 'trophy',              // the format you play
  legal: 'shield-checkmark',     // is the deck legal
  bracket: 'podium',             // the power level
  missing: 'alert-circle',       // cards you don't have yet
  work: 'construct',             // work waiting to be done
};
const iconFor = (value: string): IconName => SORT_ICONS[value] ?? 'swap-vertical';

// One way to sort: its value, its name in the menu and its short word on the
// button, in its usual direction and (when it can be reversed) the other way
export type SortChoice = {
  value: string;
  name: string;
  short: string;
  reversedName?: string;     // none: this sort can't be reversed
  reversedShort?: string;
};

type Props = {
  sort: string;              // the one in use
  reversed: boolean;         // it's the other way round
  options: SortChoice[];     // every way to sort, in the order the menu lists them
  onChoose: (sort: string) => void;
};

export default function SortButton({ sort, reversed, options, onChoose }: Props) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const current = options.find((s) => s.value === sort) ?? options[0];
  // The sort's name and short word the way round it's in now
  const flipped = reversed && current.reversedName !== undefined;
  const currentName = flipped ? current.reversedName ?? current.name : current.name;
  // Can this sort be turned round? (Then the button shows which way it's going.)
  const canReverse = current.reversedName !== undefined;

  // The button (measured, so the menu can drop down right under it) and where
  // the menu is (null: closed)
  const button = useRef<ComponentRef<typeof View>>(null);
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  function openMenu() {
    button.current?.measureInWindow((x, y, width, height) => {
      setMenu({ top: y + height + 4, right: Math.max(8, windowWidth - (x + width)) });
    });
  }

  return (
    <>
      <View ref={button} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${currentName}. Tap to change.`}
          accessibilityState={{ expanded: menu !== null }}
          onPress={openMenu}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name={iconFor(current.value)} size={16} color={colors.muted} />
          {canReverse && <Ionicons name={flipped ? 'arrow-up' : 'arrow-down'} size={11} color={colors.muted} />}
          <Ionicons name="chevron-down" size={12} color={colors.muted} />
        </Pressable>
      </View>

      {/* THE DROP-DOWN MENU: a see-through layer over the screen (tap it to
          close the menu) with the menu on it, under the button. One row per
          way to sort, a check mark on the one in use. */}
      <Modal visible={menu !== null} transparent animationType="none" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)} accessibilityLabel="Close the sort menu" />
        {menu && (
          <View
            accessibilityRole="menu"
            style={[styles.menu, { top: menu.top, right: menu.right, backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }]}
          >
            {options.map((option, index) => {
              const picked = option.value === sort;
              const reversible = option.reversedName !== undefined;
              // The name the way round it's in now (for the sort in use)
              const name = picked && flipped ? option.reversedName ?? option.name : option.name;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: picked }}
                  accessibilityLabel={name}
                  accessibilityHint={picked && reversible ? 'Tap again to reverse the order' : undefined}
                  onPress={() => { onChoose(option.value); setMenu(null); }}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                    pressed && { backgroundColor: colors.surfaceHover },
                  ]}
                >
                  <Ionicons name={iconFor(option.value)} size={18} color={picked ? colors.accent : colors.muted} />
                  <View style={styles.optionName}>
                    <Text style={[styles.optionText, { color: colors.text }, picked && styles.labelOn]}>{name}</Text>
                    {picked && reversible && <Text style={[styles.optionHint, { color: colors.muted }]}>Tap again to reverse</Text>}
                  </View>
                  {picked && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </Pressable>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
}

// The look: a small rounded button; the menu floats over everything
const styles = StyleSheet.create({
  button: { height: 30, paddingHorizontal: 8, borderRadius: RADIUS - 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  labelOn: { fontWeight: '800' },
  pressed: { opacity: 0.6 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: { position: 'absolute', minWidth: 220, borderWidth: 1, borderRadius: RADIUS, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  optionName: { flex: 1, flexShrink: 1 },
  optionText: { fontSize: 15 },
  optionHint: { fontSize: 11, marginTop: 1 },
});
