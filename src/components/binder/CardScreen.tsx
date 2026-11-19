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
     own (move to a binder, add to a list, add to a deck...), and the red
     trash can last
   - the rules, on a sheet that slides up over the card screen when you
     slide up from the "Slide up for rules" strip (or tap it). Slide the
     sheet down, or tap outside it, to put it away (see CardRules.tsx)
   EDITING (tap the pencil): copies with − and +, the finish (tap it to
   step through the finishes this printing comes in, like the Card Finder),
   the language and the condition as drop-downs. The tick at the top goes
   back. Every change is saved at once.
   The page decides what each icon does and how a change is saved; this
   screen only draws them and says what changed (see cardEdit.ts).
   ===================================================================== */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors, useTheme } from '@/hooks/useTheme';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { pictureSource } from '@/lib/http';
import type { BinderCard } from '@/lib/binderStorage';
import { loadOwned } from '@/lib/deckOwnership';
import { finishOf } from '@/lib/cardDetails';
import { CONDITIONS, conditionEdit, conditionLabel, conditionOf, conditionShort, finishEdit, languageEdit, type CardEdit } from '@/lib/cardEdit';
import { finishChoices, imageFor, languageName, nextFinish, type Finish } from '@/lib/cards';
import { cardBySetPath, loadLanguages, loadOneCard, loadSetIcons } from '@/lib/scryfall';
import { RADIUS, type Colors } from '@/theme/colors';
import CardRules from '@/components/binder/CardRules';
import { PickerButton, PickerSheet, SheetRowText, type Anchor } from '@/components/search/PickerSheet';

// The app's own line drawings of a binder, a list and a deck (the same ones
// the Shelf's buttons use), for the page's icons
export const BINDER_ICON = require('../../../assets/images/binder-outline.svg') as number;
export const LIST_ICON = require('../../../assets/images/notebook-outline.svg') as number;
export const DECK_ICON = require('../../../assets/images/deckbox-outline.svg') as number;

// Which drawing goes with where a card is: a binder, a list or a deck
const WHERE_ICON = { binder: BINDER_ICON, list: LIST_ICON, deck: DECK_ICON };

// The color of a set's symbol for each rarity: red for mythic, gold for rare, silver for
// uncommon, black for common (shown light on the dark theme, where black can't be seen)
// and purple for special. A card with no rarity saved gets the quiet gray.
function rarityColor(rarity: string | undefined, colors: Colors, dark: boolean): string {
  switch ((rarity ?? '').toLowerCase()) {
    case 'mythic': return '#e0452b';
    case 'rare': return '#d9a521';
    case 'uncommon': return '#aeb4bd';
    case 'common': return dark ? colors.text : '#000000';
    case 'special': case 'bonus': return '#9b5de5';
    default: return colors.muted;
  }
}

// One of the page's own icons (move to a binder, add to a list, add to a deck, delete...)
export type CardScreenAction = {
  label: string;                                // read out by screen readers
  icon?: keyof typeof Ionicons.glyphMap;        // a standard icon...
  picture?: number;                             // ...or one of the app's own drawings (BINDER_ICON...)
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
  where?: { kind: 'binder' | 'list' | 'deck'; name: string };   // what the card is in (shown in the bar)
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

export default function CardScreen({ card, where, copies, onChange, onOpenFinder, onClose, actions, children }: Props) {
  const colors = useColors();
  const dark = useTheme() === 'dark';
  // The set's symbol picture (once it has downloaded), and the rarity's color for it
  const setIcons = useQuery({ queryKey: ['set-icons'], queryFn: loadSetIcons });
  const setIcon = card.set ? setIcons.data?.get(card.set.toLowerCase()) : undefined;
  const rarityTint = rarityColor(card.extra?.Rarity, colors, dark);
  // How many copies of this card you own in all your binders (every printing of it)
  const ownedTotal = useMemo(
    () => (loadOwned().get(card.name.trim().toLowerCase()) ?? []).reduce((sum, print) => sum + print.count, 0),
    [card],
  );
  // A wide window (the side menu is showing) gets the pop-up; a phone gets the sheet
  const wide = useMenuStyle() !== 'none';
  // Are we editing? And which drop box (language or condition) is open, and
  // where its box is on the screen (so the list opens right under it)?
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ which: 'language' | 'condition'; anchor: Anchor } | null>(null);

  // The rules sheet: is it on the screen, and how far up it is (0 is down, 1 is
  // all the way up). It slides up when you slide up from the strip (or tap it),
  // and goes away when you slide it down or tap outside it.
  const [rulesShown, setRulesShown] = useState(false);
  const [rulesHeight, setRulesHeight] = useState(500);
  const slide = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';
  const openRules = () => {
    setRulesShown(true);
    Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: native }).start();
  };
  const closeRules = () => {
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: native }).start(() => setRulesShown(false));
  };
  // The finger-sliding: up on the strip opens the rules, down on the sheet's top closes
  // them. (The newest functions are kept in refs so the gestures never go out of date.)
  const openRulesRef = useRef(openRules);
  openRulesRef.current = openRules;
  const closeRulesRef = useRef(closeRules);
  closeRulesRef.current = closeRules;
  const slideUp = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, move) => move.dy < -10 && Math.abs(move.dy) > Math.abs(move.dx),
    onPanResponderRelease: (_event, move) => { if (move.dy < -30) openRulesRef.current(); },
  })).current;
  const slideDown = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, move) => move.dy > 10 && Math.abs(move.dy) > Math.abs(move.dx),
    onPanResponderRelease: (_event, move) => { if (move.dy > 40) closeRulesRef.current(); },
  })).current;

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

  const normalActions = actions.filter((action) => action.kind !== 'danger');
  const dangerActions = actions.filter((action) => action.kind === 'danger');

  // The card's name (with its Foil or Etched pill to the right of it) and, under
  // that, its set's symbol (in the color of its rarity) with the set's code and the
  // card's number. This goes under the card's picture.
  const identity = (
    <View style={styles.identity}>
      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2} accessibilityRole="header">{card.name}</Text>
        {card.foil ? (
          <View style={[styles.foilTag, { borderColor: colors.accent }]}>
            <Text style={[styles.foilText, { color: colors.accent }]}>{finish === 'etched' ? 'Etched' : 'Foil'}</Text>
          </View>
        ) : null}
      </View>
      {card.set ? (
        <View style={styles.setLine}>
          {setIcon ? <Image source={{ uri: setIcon }} style={styles.setIcon} contentFit="contain" tintColor={rarityTint} /> : null}
          <Text style={[styles.setText, { color: colors.muted }]}>{card.set.toUpperCase()}{card.number ? ` · #${card.number}` : ''}</Text>
        </View>
      ) : null}
    </View>
  );

  const view = (
    <View style={[styles.details, wide && styles.detailsWide]}>
      {/* The bar: language, condition, where this card is (a small binder, list or
          deck drawing with its name), and, a little further along, how many copies
          of it you own in your binders */}
      <View style={styles.infoBar}>
        <Text style={[styles.infoText, { color: colors.text }]}>{langCode.toUpperCase()}</Text>
        <Text style={[styles.infoText, { color: colors.muted }]}>·</Text>
        <Text style={[styles.infoText, { color: colors.text }]}>{conditionAbbr}</Text>
        {where && (
          <>
            <Text style={[styles.infoText, { color: colors.muted }]}>·</Text>
            <Image source={WHERE_ICON[where.kind]} style={styles.smallDrawing} contentFit="contain" tintColor={colors.muted} />
            <Text style={[styles.infoText, styles.infoName, { color: colors.text }]} numberOfLines={1}>{where.name}</Text>
          </>
        )}
        {ownedTotal > 0 && (
          <>
            <View style={styles.infoSpace} />
            <Image source={BINDER_ICON} style={styles.smallDrawing} contentFit="contain" tintColor={colors.muted} accessibilityLabel="Owned in your binders" />
            <Text style={[styles.infoText, { color: colors.text }]} accessibilityLabel={`${ownedTotal} owned in your binders`}>{ownedTotal}</Text>
          </>
        )}
      </View>

      {/* Whatever the page wants to add here */}
      {children}

      {/* The row of icons, centered: Edit first, then the page's own, then the red trash can */}
      <View style={[styles.iconRow, { borderTopColor: colors.border }]}>
        <IconButton label="Edit this card" icon="create-outline" onPress={() => setEditing(true)} />
        {normalActions.map((action) => (
          <IconButton key={action.label} label={action.label} icon={action.icon} picture={action.picture} plus={action.plus} onPress={action.onPress} />
        ))}
        {dangerActions.map((action) => (
          <IconButton key={action.label} label={action.label} icon={action.icon} picture={action.picture} plus={action.plus} onPress={action.onPress} danger />
        ))}
      </View>

      {/* The strip you slide up (or tap) to bring up the rules */}
      <View {...slideUp.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityLabel="Show the rules" onPress={openRules} style={({ pressed }) => [styles.rulesStrip, pressed && styles.pressed]}>
          <View style={[styles.grip, { backgroundColor: colors.border }]} />
          <Text style={[styles.rulesHint, { color: colors.muted }]}>Slide up for rules</Text>
        </Pressable>
      </View>
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
              <Ionicons name="remove" size={22} color={colors.accent} />
            </Pressable>
            <Text style={[styles.stepNumber, { color: colors.text }]}>{copies.count}</Text>
            <Pressable
              accessibilityRole="button" accessibilityLabel="One more copy" accessibilityState={{ disabled: copies.count >= copies.max }}
              disabled={copies.count >= copies.max} onPress={copies.onMore} hitSlop={6}
              style={({ pressed }) => [styles.step, pressed && styles.pressed, copies.count >= copies.max && styles.dimmed]}
            >
              <Ionicons name="add" size={22} color={colors.accent} />
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

  // What the Back button (Android) and the Esc key (website) do: close an open
  // drop box first, then leave the editor, then close the screen. (A ref keeps
  // the newest version, so the listener below never has to be set up again.)
  const stepBack = rulesShown ? closeRules : picker ? () => setPicker(null) : editing ? stopEditing : onClose;
  const stepBackRef = useRef(stepBack);
  stepBackRef.current = stepBack;
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') stepBackRef.current(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { stepBackRef.current(); return true; });
    return () => listener.remove();
  }, []);

  // This is NOT a full-screen window: it fills just the page it's drawn on, so
  // the tab bar along the bottom (or the side menu on a wide window) stays
  // showing and the sheet sits above it
  return (
    <View style={styles.overlay}>
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
            {/* In the editor only: "Edit" with the card's name, and a tick to go back */}
            {editing && (
              <View style={styles.header}>
                <Text style={[styles.name, styles.headerText, { color: colors.text }]} numberOfLines={2} accessibilityRole="header">Edit {card.name}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Done editing" onPress={stopEditing} hitSlop={6} style={({ pressed }) => [styles.tick, pressed && styles.pressed]}>
                  <Ionicons name="checkmark" size={24} color={colors.accent} />
                </Pressable>
              </View>
            )}

            {/* The body scrolls if it's taller than the screen. Wide: the picture (with the
                name under it) on the left, details right. Phone: one column. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={wide ? styles.bodyWide : styles.bodyNarrow}>
              {wide ? (
                <View style={styles.leftColumn}>{picture}{!editing && identity}</View>
              ) : (
                <>
                  <View style={styles.pictureCenter}>{picture}</View>
                  {!editing && identity}
                </>
              )}
              {editing ? edit : view}
            </ScrollView>
          </View>
        </View>
      </View>
      {/* The rules sheet: slides up over the card screen. Slide it down, or tap
          outside it (on the dimmed part above it), to put it away. */}
      {rulesShown && (
        <View style={styles.rulesLayer} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.4)', opacity: slide }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeRules} accessibilityRole="button" accessibilityLabel="Close the rules" />
          </Animated.View>
          <Animated.View
            onLayout={(event) => setRulesHeight(event.nativeEvent.layout.height)}
            style={[
              styles.rulesSheet, wide && styles.rulesSheetWide,
              { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow },
              { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [rulesHeight, 0] }) }] },
            ]}
            accessibilityViewIsModal
            aria-modal
          >
            {/* The top of the sheet: slide down from here to put it away */}
            <View {...slideDown.panHandlers} style={styles.rulesTop}>
              <View style={[styles.grip, { backgroundColor: colors.border }]} />
              <Text style={[styles.rulesTitle, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">Rules · {card.name}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.rulesBody}>
              <CardRules card={card} />
            </ScrollView>
          </Animated.View>
        </View>
      )}
      {/* The open drop box's list, floating over everything */}
      {pickerList}
    </View>
  );
}

/* ---------- small pieces ---------- */

// One icon you tap in the row, with an optional small + in its lower-right corner
function IconButton({ label, icon, picture, plus, danger, onPress }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; picture?: number; plus?: boolean; danger?: boolean; onPress: () => void;
}) {
  const colors = useColors();
  const color = danger ? colors.error : colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <View>
        {picture !== undefined
          ? <Image source={picture} style={styles.drawing} contentFit="contain" tintColor={color} />
          : <Ionicons name={icon ?? 'help-outline'} size={24} color={color} />}
        {plus && (
          <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
            <Ionicons name="add" size={11} color={colors.accentText} />
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
  // Covers the page it's on (above everything on it, like the red + button)
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  bottomWrap: { flex: 1, justifyContent: 'flex-end' },
  popup: { width: '100%', maxWidth: 660, maxHeight: '90%', borderWidth: 1, borderRadius: RADIUS * 2.2, padding: 24, gap: 14 },
  sheet: {
    width: '100%', maxHeight: '92%', borderTopWidth: 1,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16, gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  // Under the picture: the name with its pill, then the set line
  identity: { gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setIcon: { width: 18, height: 18 },
  setText: { fontSize: 14, fontWeight: '600' },
  leftColumn: { width: 230, gap: 12 },
  // The bar of language, condition, where it is and how many you own
  infoBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  infoText: { fontSize: 15 },
  infoName: { flexShrink: 1 },
  infoSpace: { width: 16 },
  smallDrawing: { width: 17, height: 15 },
  foilTag: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  foilText: { fontSize: 12, fontWeight: '700' },
  tick: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, paddingBottom: 8 },
  bodyNarrow: { gap: 14, paddingBottom: 8 },
  pictureCenter: { alignItems: 'center' },
  // The details column: on the pop-up it takes the room beside the picture
  // (on a phone it just stacks under the picture, so it must not use flex: 1,
  // which would squash it to nothing inside the scrolling area)
  details: { minWidth: 0, gap: 12 },
  detailsWide: { flex: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  drawing: { width: 26, height: 22 },
  rulesStrip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 6 },
  grip: { width: 40, height: 4, borderRadius: 2 },
  rulesHint: { fontSize: 12 },
  rulesLayer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center' },
  rulesSheet: { width: '100%', height: '62%', borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 16 },
  rulesSheetWide: { maxWidth: 660 },
  rulesTop: { alignItems: 'center', gap: 8, paddingTop: 10, paddingBottom: 12 },
  rulesTitle: { fontSize: 16, fontWeight: '700' },
  rulesBody: { paddingBottom: 12 },
  badge: { position: 'absolute', right: -8, bottom: -6, width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  dropBox: { minWidth: 200 },
  pickerNote: { fontSize: 14, padding: 14 },
  abbr: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueText: { fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
});
