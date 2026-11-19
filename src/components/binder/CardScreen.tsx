/* =====================================================================
   THE CARD SCREEN (what opens when you tap a card)
   One screen for a card in a binder, a list or a deck, so all three look
   and work the same.
   - On a phone it slides up from the bottom as a sheet.
   - On a wide window (a tablet or the website) it opens as a pop-up in the
     middle, with the page dimmed behind it, the card on the left and its
     details beside it.
   - Tap outside it to close it. Tap the card's picture to open the card in
     the Card Finder.
   VIEWING (the first thing you see):
   - the card's name, where it is (the page gives that line) and a Foil tag
   - its picture, then a line saying what you own: copies, finish,
     language and condition
   - anything extra the page wants to add (the deck's "printings you own")
   - a row of icons you tap, centered: the pencil (Edit), then the page's
     own (move to a binder, add to a deck...), and the red trash can last
   - "Show rules", folded away until you tap it (see CardRules.tsx)
   EDITING (tap the pencil): copies with − and +, the finish (tap it to
   step through the finishes this printing comes in, like the Card Finder),
   the language and the condition as drop-downs. The tick at the top goes
   back. Every change is saved at once.
   The page decides what each icon does and how a change is saved; this
   screen only draws them and says what changed (see cardEdit.ts).
   ===================================================================== */

import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { pictureSource } from '@/lib/http';
import { cardCount, type BinderCard } from '@/lib/binderStorage';
import { finishOf } from '@/lib/cardDetails';
import { CONDITIONS, conditionEdit, conditionLabel, conditionOf, conditionShort, finishEdit, languageEdit, type CardEdit } from '@/lib/cardEdit';
import { finishChoices, imageFor, languageName, nextFinish, type Finish } from '@/lib/cards';
import { cardBySetPath, loadLanguages, loadOneCard } from '@/lib/scryfall';
import { RADIUS } from '@/theme/colors';
import CardRules from '@/components/binder/CardRules';
import { PickerButton, PickerSheet, SheetRowText, type Anchor } from '@/components/search/PickerSheet';

// One of the page's own icons (move to a binder, add to a deck, delete...)
export type CardScreenAction = {
  label: string;                                // read out by screen readers
  icon: keyof typeof Ionicons.glyphMap;
  plus?: boolean;                               // a small + in the icon's lower-right corner
  onPress: () => void;
  kind?: 'danger';                              // red, and always last
};

// The copies control (shown in Edit mode): how many, the most allowed, and what − and + do
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
  onChange?: (edit: CardEdit) => void;   // the page saves a change to the card
  onOpenFinder: () => void;
  onClose: () => void;
  actions: CardScreenAction[];
  children?: ReactNode;            // extra things the page wants to show
};

// A card's shape (63 wide, 88 tall) and how big its picture is drawn
const CARD_RATIO = 63 / 88;

// The words for each finish
const FINISH_WORDS: Record<Finish, string> = { nonfoil: 'Normal', foil: 'Foil', etched: 'Etched' };

export default function CardScreen({ card, subtitle, copies, onChange, onOpenFinder, onClose, actions, children }: Props) {
  const colors = useColors();
  // A wide window (the side menu is showing) gets the pop-up; a phone gets the sheet
  const wide = useMenuStyle() !== 'none';
  // Are we editing? And which drop box (language or condition) is open, and
  // where its box is on the screen (so the list opens right under it)?
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ which: 'language' | 'condition'; anchor: Anchor } | null>(null);

  // While editing: the card's printing (to know which finishes it comes in), and
  // its printings in every language (once the language drop-down is opened)
  const hasPrinting = !!card.set && !!card.number;
  const print = useQuery({
    queryKey: ['edit-print', card.set, card.number],
    queryFn: () => loadOneCard(cardBySetPath(card.set, card.number)),
    staleTime: Infinity,
    enabled: editing && hasPrinting,
  });
  const languages = useQuery({
    queryKey: ['edit-languages', card.set, card.number],
    queryFn: () => loadLanguages(print.data!, languageName),
    staleTime: Infinity,
    enabled: editing && picker?.which === 'language' && !!print.data,
  });

  // What the card is now
  const finish = finishOf(card);
  const langCode = card.lang ?? 'en';
  const conditionName = conditionLabel(conditionOf(card));
  const conditionAbbr = conditionShort(conditionOf(card));
  const finishOptions = print.data ? finishChoices(print.data) : null;
  const canCycleFinish = !!finishOptions && finishOptions.length > 1;

  // Leave edit mode (and close any open drop box)
  const stopEditing = () => { setEditing(false); setPicker(null); };

  // The picture's width: bigger on a wide window, smaller on a phone while editing
  const pictureWidth = wide ? 230 : editing ? 120 : 190;
  const picture = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${card.name} in the Card Finder`}
      onPress={onOpenFinder}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Image source={pictureSource(card.image)} style={{ width: pictureWidth, aspectRatio: CARD_RATIO, borderRadius: 12 }} contentFit="contain" />
    </Pressable>
  );

  /* ---------- the view: what you own, then the row of icons ---------- */

  const count = copies ? copies.count : cardCount(card);
  const normalActions = actions.filter((action) => action.kind !== 'danger');
  const dangerActions = actions.filter((action) => action.kind === 'danger');
  const view = (
    <View style={[styles.details, wide && styles.detailsWide]}>
      {/* What you own */}
      <Text style={[styles.owned, { color: colors.text }]}>
        {count} {count === 1 ? 'copy' : 'copies'}
        <Text style={{ color: colors.muted }}>  ·  </Text>{FINISH_WORDS[finish]}
        <Text style={{ color: colors.muted }}>  ·  </Text>{langCode.toUpperCase()}
        <Text style={{ color: colors.muted }}>  ·  </Text>{conditionAbbr}
      </Text>

      {/* Whatever the page wants to add here */}
      {children}

      {/* The row of icons, centered: Edit first, then the page's own, then the red trash can */}
      <View style={[styles.iconRow, { borderTopColor: colors.border }]}>
        <IconButton label="Edit this card" icon="create-outline" onPress={() => setEditing(true)} />
        {normalActions.map((action) => (
          <IconButton key={action.label} label={action.label} icon={action.icon} plus={action.plus} onPress={action.onPress} />
        ))}
        {dangerActions.map((action) => (
          <IconButton key={action.label} label={action.label} icon={action.icon} plus={action.plus} onPress={action.onPress} danger />
        ))}
      </View>

      {/* The rules, folded away until asked for */}
      <CardRules card={card} />
    </View>
  );

  /* ---------- the editor: copies, finish, language, condition ---------- */

  const edit = (
    <View style={[styles.details, wide && styles.detailsWide]}>
      {/* Copies: plain orange − and + */}
      {copies && (
        <EditRow label="Copies">
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel={copies.lessLabel} onPress={copies.onLess} hitSlop={6} style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
              <Ionicons name="remove" size={30} color={colors.accent} />
            </Pressable>
            <Text style={[styles.stepNumber, { color: colors.text }]}>{copies.count}</Text>
            <Pressable
              accessibilityRole="button" accessibilityLabel="One more copy" accessibilityState={{ disabled: copies.count >= copies.max }}
              disabled={copies.count >= copies.max} onPress={copies.onMore} hitSlop={6}
              style={({ pressed }) => [styles.step, pressed && styles.pressed, copies.count >= copies.max && styles.dimmed]}
            >
              <Ionicons name="add" size={30} color={colors.accent} />
            </Pressable>
          </View>
        </EditRow>
      )}

      {/* Finish: tap to step through the finishes this printing comes in */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Finish: ${FINISH_WORDS[finish]}.${canCycleFinish ? ' Tap to change.' : ''}`}
        disabled={!canCycleFinish}
        onPress={() => print.data && onChange?.(finishEdit(nextFinish(print.data, finish)))}
        style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && styles.pressed]}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>Finish</Text>
        <View style={styles.rowValue}>
          <Text style={[styles.valueText, { color: finish === 'nonfoil' ? colors.text : colors.accent, fontWeight: '700' }]}>{FINISH_WORDS[finish]}</Text>
          {canCycleFinish && <Ionicons name="swap-horizontal" size={20} color={colors.accent} />}
        </View>
      </Pressable>

      {/* Language: a drop box, the same as in the Card Finder. Its list opens right
          under the box and floats over the screen, so nothing moves. */}
      <EditRow label="Language">
        <PickerButton
          accessibilityLabel={`Language: ${languageName(langCode)}`} disabled={!hasPrinting} style={styles.dropBox}
          onPress={(anchor) => setPicker({ which: 'language', anchor })}
        >
          <SheetRowText text={languageName(langCode)} />
        </PickerButton>
      </EditRow>

      {/* Condition: a drop box of the six conditions */}
      <EditRow label="Condition">
        <PickerButton
          accessibilityLabel={`Condition: ${conditionName}`} style={styles.dropBox}
          onPress={(anchor) => setPicker({ which: 'condition', anchor })}
        >
          <SheetRowText text={conditionName} />
        </PickerButton>
      </EditRow>
    </View>
  );

  // The open drop box's list (it sits outside the card screen's own layout)
  const pickerList = picker?.which === 'language' ? (
    <PickerSheet
      title="Language" anchor={picker.anchor} items={languages.data ?? []} current={languages.data?.find((v) => v.lang === langCode) ?? null}
      keyOf={(version) => version.lang} labelOf={(version) => languageName(version.lang)}
      header={!languages.data ? <Text style={[styles.pickerNote, { color: colors.muted }]}>{languages.isError || print.isError ? 'Couldn\'t load the languages.' : 'Loading languages...'}</Text> : undefined}
      renderRow={(version) => (
        <>
          <SheetRowText text={languageName(version.lang)} bold={version.lang === langCode} />
          <Text style={[styles.abbr, { color: colors.muted }]}>{version.lang.toUpperCase()}</Text>
        </>
      )}
      onPick={(version) => {
        if (version.lang !== langCode) onChange?.(languageEdit(version.lang, imageFor(version, card.face, ['normal', 'large'])));
        setPicker(null);
      }}
      onClose={() => setPicker(null)}
    />
  ) : picker?.which === 'condition' ? (
    <PickerSheet
      title="Condition" anchor={picker.anchor} items={CONDITIONS} current={CONDITIONS.find((c) => c.label === conditionName) ?? null}
      keyOf={(c) => c.code} labelOf={(c) => c.label}
      renderRow={(c) => (
        <>
          <SheetRowText text={c.label} bold={c.label === conditionName} />
          <Text style={[styles.abbr, { color: colors.muted }]}>{c.short}</Text>
        </>
      )}
      onPick={(c) => { onChange?.(conditionEdit(c.code)); setPicker(null); }}
      onClose={() => setPicker(null)}
    />
  ) : null;

  /* ---------- the screen around it ---------- */

  return (
    // "transparent" lets the dimmed page show around the screen; onRequestClose is
    // Android's Back button (and Esc on the website): it leaves the editor first
    <Modal transparent animationType={wide ? 'fade' : 'slide'} visible onRequestClose={editing ? stopEditing : onClose}>
      <View style={styles.fill}>
        {/* The dimmed area: tapping it closes the screen */}
        <Pressable style={[styles.backdrop, { backgroundColor: 'rgba(0, 0, 0, 0.55)' }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />

        {/* Where the screen sits: the middle on a wide window, the bottom on a phone
            (pointerEvents "box-none" lets taps beside it reach the dimmed area) */}
        <View style={wide ? styles.centerWrap : styles.bottomWrap} pointerEvents="box-none">
          <View
            style={[
              wide ? styles.popup : styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow },
            ]}
            accessibilityViewIsModal
            aria-modal
          >
            {/* The name and where it is. In the editor: "Edit" and a tick to go back. */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={2} accessibilityRole="header">
                  {editing ? `Edit ${card.name}` : card.name}
                </Text>
                {!editing && (subtitle || card.foil) && (
                  <View style={styles.subRow}>
                    {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
                    {card.foil ? (
                      <View style={[styles.foilTag, { borderColor: colors.accent }]}>
                        <Text style={[styles.foilText, { color: colors.accent }]}>{finish === 'etched' ? 'Etched' : 'Foil'}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              {editing && (
                <Pressable accessibilityRole="button" accessibilityLabel="Done editing" onPress={stopEditing} hitSlop={6} style={({ pressed }) => [styles.tick, pressed && styles.pressed]}>
                  <Ionicons name="checkmark" size={30} color={colors.accent} />
                </Pressable>
              )}
            </View>

            {/* The body scrolls if it's taller than the screen. Wide: picture left, details right. Phone: one column. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={wide ? styles.bodyWide : styles.bodyNarrow}>
              <View style={wide ? undefined : styles.pictureCenter}>{picture}</View>
              {editing ? edit : view}
            </ScrollView>
          </View>
        </View>
      </View>
      {/* The open drop box's list, floating over everything */}
      {pickerList}
    </Modal>
  );
}

/* ---------- small pieces ---------- */

// One icon you tap in the row, with an optional small + in its lower-right corner
function IconButton({ label, icon, plus, danger, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; plus?: boolean; danger?: boolean; onPress: () => void;
}) {
  const colors = useColors();
  const color = danger ? colors.error : colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <View>
        <Ionicons name={icon} size={30} color={color} />
        {plus && (
          <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
            <Ionicons name="add" size={13} color={colors.accentText} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// A row in the editor with its name on the left and something on the right
function EditRow({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

// The look: a dimmed backdrop, then either a pop-up in the middle (wide) or
// a sheet along the bottom (phone), with rounded corners
const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  bottomWrap: { flex: 1, justifyContent: 'flex-end' },
  popup: { width: '100%', maxWidth: 660, maxHeight: '90%', borderWidth: 1, borderRadius: RADIUS * 2.2, padding: 24, gap: 14 },
  sheet: {
    width: '100%', maxHeight: '92%', borderTopWidth: 1,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24, gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 22, fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  subtitle: { fontSize: 13 },
  foilTag: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  foilText: { fontSize: 12, fontWeight: '700' },
  tick: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, paddingBottom: 8 },
  bodyNarrow: { gap: 14, paddingBottom: 8 },
  pictureCenter: { alignItems: 'center' },
  // The details column: on the pop-up it takes the room beside the picture
  // (on a phone it just stacks under the picture, so it must not use flex: 1,
  // which would squash it to nothing inside the scrolling area)
  details: { minWidth: 0, gap: 12 },
  detailsWide: { flex: 1 },
  owned: { fontSize: 15, lineHeight: 22 },
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  iconButton: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -9, bottom: -7, width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  dropBox: { minWidth: 200 },
  pickerNote: { fontSize: 14, padding: 14 },
  abbr: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueText: { fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { minWidth: 36, textAlign: 'center', fontSize: 22, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
});
