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
import SymbolText from '@/components/SymbolText';
import { Animated, BackHandler, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors, useTheme } from '@/hooks/useTheme';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { useSettings } from '@/hooks/useSettings';
import { STORE_ICONS } from '@/components/settings/PriceStorePicker';
import { copyPrice, currencyOf, formatPrice, loadCardKingdomPrices } from '@/lib/prices';
import { pictureSource } from '@/lib/http';
import type { BinderCard } from '@/lib/binderStorage';
import { loadOwned } from '@/lib/deckOwnership';
import { finishOf, printedNameOf } from '@/lib/cardDetails';
import { CONDITIONS, conditionEdit, conditionLabel, conditionOf, conditionShort, finishEdit, languageEdit, type CardEdit } from '@/lib/cardEdit';
import { finishChoices, imageFor, languageName, nextFinish, type Finish } from '@/lib/cards';
import { cardBySetPath, loadLanguages, loadOneCard, loadSetIcons } from '@/lib/scryfall';
import { RADIUS } from '@/theme/colors';
import { rarityColor } from '@/lib/rarity';
import { versionEdit } from '@/lib/cardVersion';
import { FOIL_COLORS } from '@/components/binder/FoilFrame';
import VersionPicker from '@/components/binder/VersionPicker';
import CardRules from '@/components/binder/CardRules';
import { PickerButton, PickerSheet, SheetRowText, type Anchor } from '@/components/search/PickerSheet';

// The app's own line drawings of a binder, a list and a deck (the same ones
// the Shelf's buttons use), for the page's icons
export const BINDER_ICON = require('../../../assets/images/binder-outline.svg') as number;
export const LIST_ICON = require('../../../assets/images/notebook-outline.svg') as number;
export const DECK_ICON = require('../../../assets/images/deckbox-outline.svg') as number;

// Which drawing goes with where a card is: a binder, a list or a deck
const WHERE_ICON = { binder: BINDER_ICON, list: LIST_ICON, deck: DECK_ICON };

// One of the page's own icons (move to a binder, add to a list, add to a deck, delete...)
export type CardScreenAction = {
  label: string;                                // read out by screen readers
  short: string;                                // the one small word shown under the icon ("Move", "Add", "Delete"...)
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
  // The icons in the row grow and shrink a little with the window: smaller on a
  // very narrow phone, larger on a wide window (the row also shares out its width)
  const { width: windowWidth } = useWindowDimensions();
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
  // Is the list of every version of this card open?
  const [versionsOpen, setVersionsOpen] = useState(false);

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
    // Needed while editing (the finishes it comes in) and for the card's price next to its set
    enabled: hasPrinting,
  });
  // The price of ONE copy of this card at the store chosen in Settings (Card Kingdom's prices come
  // from their own downloaded list, so that is only fetched when it's the chosen store)
  const { priceStore } = useSettings();
  const cardKingdom = useQuery({
    queryKey: ['card-kingdom-prices'],
    queryFn: loadCardKingdomPrices,
    gcTime: Infinity,
    enabled: priceStore === 'cardkingdom' && hasPrinting,
  });
  const languages = useQuery({
    queryKey: ['edit-languages', card.set, card.number],
    queryFn: () => loadLanguages(print.data!, languageName),
    staleTime: Infinity,
    enabled: editing && picker?.which === 'language' && !!print.data,
  });

  // What the card is now (the set's name comes from the card's saved details, or from
  // the printing once it's loaded)
  const setName = print.data?.set_name ?? card.extra?.['Set name'] ?? card.set.toUpperCase();
  const finish = finishOf(card);
  const langCode = card.lang ?? 'en';
  const conditionName = conditionLabel(conditionOf(card));
  const conditionAbbr = conditionShort(conditionOf(card));
  const finishOptions = print.data ? finishChoices(print.data) : null;
  // The price of one copy as text (null while it's still being fetched, "—" when the store has no price for it)
  const waitingForPrice = !print.data || (priceStore === 'cardkingdom' && !cardKingdom.data);
  const priceText = waitingForPrice ? null : formatPrice(copyPrice(priceStore, print.data, finish, cardKingdom.data), currencyOf(priceStore));
  const canCycleFinish = !!finishOptions && finishOptions.length > 1;

  // Leave edit mode (and close any open drop box)
  const stopEditing = () => { setEditing(false); setPicker(null); setVersionsOpen(false); };

  // The picture's width: bigger on a wide window, smaller on a phone while editing
  const pictureWidth = editing ? (wide ? 173 : 90) : wide ? 230 : 190;
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

  const iconSize = windowWidth < 360 ? 22 : wide ? 26 : 24;
  const normalActions = actions.filter((action) => action.kind !== 'danger');
  const dangerActions = actions.filter((action) => action.kind === 'danger');

  // The card's name (with its Foil or Etched pill to the right of it) and, under
  // that, its set's symbol (in the color of its rarity) with the set's code and the
  // card's number. This goes under the card's picture.
  // A reskinned card (Conqueror's Flail printed as "Ronin's Arsenal") shows the name
  // printed on it as the title, and its real name in small letters just below.
  const printedName = printedNameOf(card);
  const reskinned = printedName !== card.name;
  const identity = (
    <View style={styles.identity}>
      <View style={styles.nameRow}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2} accessibilityRole="header">{printedName}</Text>
        {card.foil ? (
          <View style={styles.foilTag}>
            {finish === 'etched'
              ? <LinearGradient colors={['#f4f5f7', '#aeb3bc', '#e6e8ec', '#8f959f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              : <LinearGradient colors={[...FOIL_COLORS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
            <Text style={styles.foilText}>{finish === 'etched' ? 'Etched' : 'Foil'}</Text>
          </View>
        ) : null}
      </View>
      {reskinned ? (
        <Text style={[styles.realName, { color: colors.muted }]} numberOfLines={1}>Real name: {card.name}</Text>
      ) : null}
      {card.set ? (
        <View style={styles.setLine}>
          {setIcon ? <Image source={{ uri: setIcon }} style={styles.setIcon} contentFit="contain" tintColor={rarityTint} /> : null}
          <Text style={[styles.setText, { color: colors.muted }]}>{card.set.toUpperCase()}{card.number ? ` · #${card.number}` : ''}</Text>
          {/* A gap about two long dashes wide, then the chosen price store's icon and the price of one copy */}
          {priceText !== null ? (
            <View style={styles.priceBit} accessible accessibilityLabel={`Price of one copy: ${priceText}`}>
              <Image source={STORE_ICONS[priceStore]} style={styles.storeIcon} contentFit="contain" />
              <Text style={[styles.priceText, { color: colors.text }]}>{priceText}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  // The bar: language, condition, where this card is (a small binder, list or
  // deck drawing with its name), and, a little further along, how many copies
  // of it you own in your binders
  const bar = (
    <View style={styles.infoBar}>
      <Text style={[styles.infoText, { color: colors.text }]}>{langCode.toUpperCase()}</Text>
      <Text style={[styles.infoText, { color: colors.muted }]}>·</Text>
      <Text style={[styles.infoText, { color: colors.text }]}>{conditionAbbr}</Text>
      {where && (
        <>
          <Text style={[styles.infoText, { color: colors.muted }]}>·</Text>
          <Image source={WHERE_ICON[where.kind]} style={styles.smallDrawing} contentFit="contain" tintColor={colors.muted} />
          <SymbolText style={[styles.infoText, styles.infoName, { color: colors.text }]} numberOfLines={1} size={11}>{where.name}</SymbolText>
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
  );

  // The row of icons, centered: Edit first, then the page's own, then the red trash can
  const iconRowEl = (
    <View style={[styles.iconRow, { borderTopColor: colors.border }]}>
      <IconButton label="Edit this card" caption="Edit" icon="create-outline" size={iconSize} onPress={() => setEditing(true)} />
      {normalActions.map((action) => (
        <IconButton key={action.label} label={action.label} caption={action.short} icon={action.icon} picture={action.picture} plus={action.plus} size={iconSize} onPress={action.onPress} />
      ))}
      {dangerActions.map((action) => (
        <IconButton key={action.label} label={action.label} caption={action.short} icon={action.icon} picture={action.picture} plus={action.plus} size={iconSize} onPress={action.onPress} danger />
      ))}
    </View>
  );

  // PHONES: the strip you slide up (or tap) to bring up the rules
  const stripEl = (
    <View {...slideUp.panHandlers}>
      <Pressable accessibilityRole="button" accessibilityLabel="Show the rules" onPress={openRules} style={({ pressed }) => [styles.rulesStrip, pressed && styles.pressed]}>
        <View style={[styles.grip, { backgroundColor: colors.border }]} />
        <Text style={[styles.rulesHint, { color: colors.muted }]}>Slide up for rules</Text>
      </Pressable>
    </View>
  );

  // WIDE WINDOWS: the rules text, always showing (there's room for it)
  const rulesInline = (
    <View style={styles.rulesInline}>
      <Text style={[styles.rulesInlineTitle, { color: colors.muted }]}>RULES</Text>
      <CardRules card={card} />
    </View>
  );

  // What goes beside or under the picture when you're just looking.
  // - Wide: the info is BESIDE the card (name, set line, the bar, the page's own
  //   extras, then the rules); the icons are pinned along the bottom of the pop-up.
  // - Phone: the name and set line are under the picture, then the bar, the icons
  //   and the slide-up rules strip.
  // The name, the set line and the bar sit close together as one group
  const infoGroup = (
    <View style={styles.infoGroup}>
      {identity}
      {bar}
    </View>
  );

  const view = wide ? (
    <View style={[styles.details, styles.detailsWide]}>
      {infoGroup}
      {children}
      {rulesInline}
    </View>
  ) : (
    <View style={styles.details}>
      {children}
      {iconRowEl}
      {stripEl}
    </View>
  );

  /* ---------- the editor: copies, finish, language, condition ---------- */

  const edit = (
    <View style={[styles.details, wide && styles.detailsWide]}>
      {/* Set: a drop box showing the set's symbol (in its rarity's color) and name.
          Tap it to see every version of the card and pick another. */}
      {hasPrinting && (
        <EditRow label="Version">
          <PickerButton accessibilityLabel={`Version: ${setName}. Tap to pick another.`} style={styles.dropBox} boxStyle={styles.smallBox} onPress={() => setVersionsOpen(true)}>
            <View style={styles.setBox}>
              {setIcon ? <Image source={{ uri: setIcon }} style={styles.setBoxIcon} contentFit="contain" tintColor={rarityTint} /> : null}
              <SheetRowText text={setName} size={12} />
            </View>
          </PickerButton>
        </EditRow>
      )}

      {/* Copies: plain orange − and + */}
      {copies && (
        <EditRow label="Copies">
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel={copies.lessLabel} onPress={copies.onLess} hitSlop={6} style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
              <Ionicons name="remove" size={17} color={colors.accent} />
            </Pressable>
            <Text style={[styles.stepNumber, { color: colors.text }]}>{copies.count}</Text>
            <Pressable
              accessibilityRole="button" accessibilityLabel="One more copy" accessibilityState={{ disabled: copies.count >= copies.max }}
              disabled={copies.count >= copies.max} onPress={copies.onMore} hitSlop={6}
              style={({ pressed }) => [styles.step, pressed && styles.pressed, copies.count >= copies.max && styles.dimmed]}
            >
              <Ionicons name="add" size={17} color={colors.accent} />
            </Pressable>
          </View>
        </EditRow>
      )}

      {/* Finish: the same button as in the Card Finder. Not foil is see-through with a
          dashed outline, Foil is filled with the rainbow and Etched with silver (black
          text on both). Each tap steps to the next finish this printing comes in. */}
      <EditRow label="Finish">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Finish: ${FINISH_WORDS[finish]}.${canCycleFinish ? ' Tap to change.' : ''}`}
          disabled={!canCycleFinish}
          onPress={() => print.data && onChange?.(finishEdit(nextFinish(print.data, finish)))}
          style={({ pressed }) => [
            styles.finishPill,
            finish === 'nonfoil' && { borderColor: colors.border, borderStyle: 'dashed', borderWidth: 1 },
            finish === 'nonfoil' && !canCycleFinish && styles.dimmed,
            pressed && styles.pressed,
          ]}
        >
          {finish === 'foil' && <LinearGradient colors={[...FOIL_COLORS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          {finish === 'etched' && <LinearGradient colors={['#f4f5f7', '#aeb3bc', '#e6e8ec', '#8f959f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          <Text style={[styles.finishText, { color: finish === 'nonfoil' ? colors.text : '#000000' }]}>{finish === 'etched' ? 'Etched' : 'Foil'}</Text>
        </Pressable>
      </EditRow>

      {/* Language: a drop box, the same as in the Card Finder. Its list opens right
          under the box and floats over the screen, so nothing moves. */}
      <EditRow label="Language">
        <PickerButton
          accessibilityLabel={`Language: ${languageName(langCode)}`} disabled={!hasPrinting} style={styles.dropBox} boxStyle={styles.smallBox}
          onPress={(anchor) => setPicker({ which: 'language', anchor })}
        >
          <SheetRowText text={languageName(langCode)} size={12} />
        </PickerButton>
      </EditRow>

      {/* Condition: a drop box of the six conditions */}
      <EditRow label="Condition">
        <PickerButton
          accessibilityLabel={`Condition: ${conditionName}`} style={styles.dropBox} boxStyle={styles.smallBox}
          onPress={(anchor) => setPicker({ which: 'condition', anchor })}
        >
          <SheetRowText text={conditionName} size={12} />
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
  const stepBack = rulesShown ? closeRules : versionsOpen ? () => setVersionsOpen(false) : picker ? () => setPicker(null) : editing ? stopEditing : onClose;
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
                  <Ionicons name="checkmark" size={18} color={colors.accent} />
                </Pressable>
              </View>
            )}

            {/* The body scrolls if it's taller than the screen. Wide: the picture (with the
                name under it) on the left, details right. Phone: one column. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={wide ? styles.bodyWide : styles.bodyNarrow}>
              {wide ? (
                <View style={[styles.leftColumn, { width: pictureWidth }]}>{picture}</View>
              ) : (
                <>
                  <View style={styles.pictureCenter}>{picture}</View>
                  {!editing && infoGroup}
                </>
              )}
              {editing ? edit : view}
            </ScrollView>

            {/* Wide windows: the icons stay along the bottom of the pop-up while the rest scrolls */}
            {wide && !editing && iconRowEl}
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
      {/* Every version of the card, to pick another printing */}
      {versionsOpen && card.set && card.number && (
        <VersionPicker
          set={card.set} number={card.number}
          onPick={(version) => {
            if (version.set !== card.set || version.collector_number !== card.number) onChange?.(versionEdit(card, version));
            setVersionsOpen(false);
          }}
          onClose={() => setVersionsOpen(false)}
        />
      )}
      {/* The open drop box's list, floating over everything */}
      {pickerList}
    </View>
  );
}

/* ---------- small pieces ---------- */

// One icon you tap in the row, with an optional small + in its lower-right corner
function IconButton({ label, caption, icon, picture, plus, danger, size, onPress }: {
  label: string; caption: string; icon?: keyof typeof Ionicons.glyphMap; picture?: number; plus?: boolean; danger?: boolean; size: number; onPress: () => void;
}) {
  const colors = useColors();
  const color = danger ? colors.error : colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      {/* (every icon area is the same height, so the words under them line up) */}
      <View style={{ height: size + 2, justifyContent: 'center', alignItems: 'center' }}>
        {picture !== undefined
          ? <Image source={picture} style={{ width: Math.round(size * 1.08), height: Math.round(size * 0.92) }} contentFit="contain" tintColor={color} />
          : <Ionicons name={icon ?? 'help-outline'} size={size} color={color} />}
        {plus && (
          <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
            <Ionicons name="add" size={11} color={colors.accentText} />
          </View>
        )}
      </View>
      {/* The small word under the icon (screen readers read the button's full label instead) */}
      <Text style={[styles.iconCaption, { color: danger ? colors.error : colors.muted }]} numberOfLines={1} adjustsFontSizeToFit importantForAccessibility="no" accessibilityElementsHidden>{caption}</Text>
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
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  // The card's own information (the name with its pill, the set line, and the bar of
  // language, condition, where it is and how many you own). Sizes here were halved, then raised 3 points (the Edit screen's title is separate)
  // of what it was; the Edit screen's title (styles.name) keeps its full size.
  identity: { gap: 3 },
  infoGroup: { gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardName: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  // The small line under a reskinned card's printed name, giving its real name
  realName: { fontSize: 10.5 },
  setLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setIcon: { width: 12, height: 12 },
  setText: { fontSize: 10, fontWeight: '600' },
  // The price: it sits after a gap about as wide as two long dashes (20 points at this text size)
  priceBit: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 20 },
  storeIcon: { width: 13, height: 13, padding: 1, borderRadius: 3, backgroundColor: '#ffffff' },
  priceText: { fontSize: 10, fontWeight: '600' },
  leftColumn: { width: 230, gap: 12 },
  infoBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  infoText: { fontSize: 10.5 },
  infoName: { flexShrink: 1 },
  infoSpace: { width: 8 },
  smallDrawing: { width: 12, height: 11 },
  // The Foil pill is filled with the rainbow and the Etched pill with silver (like the
  // Card Finder's finish button), with black text so it reads on either
  foilTag: { borderRadius: 5, overflow: 'hidden', paddingHorizontal: 4, paddingVertical: 0.5 },
  foilText: { fontSize: 9, fontWeight: '700', color: '#000000' },
  tick: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center' },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, paddingBottom: 8 },
  bodyNarrow: { gap: 14, paddingBottom: 8 },
  pictureCenter: { alignItems: 'center' },
  // The details column: on the pop-up it takes the room beside the picture
  // (on a phone it just stacks under the picture, so it must not use flex: 1,
  // which would squash it to nothing inside the scrolling area)
  details: { minWidth: 0, gap: 12 },
  detailsWide: { flex: 1 },
  // The icons share the row's width equally (each slot is at most 84 wide, so a wide
  // pop-up keeps them together in the middle) and each is at least 40 wide, so five
  // or six still fit on a narrow phone
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  iconButton: { flex: 1, maxWidth: 84, minWidth: 40, height: 62, alignItems: 'center', justifyContent: 'center', gap: 3 },
  // The small word under each icon
  iconCaption: { fontSize: 10.5, fontWeight: '600', maxWidth: '100%', textAlign: 'center' },
  rulesInline: { gap: 6, marginTop: 4 },
  rulesInlineTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
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
  row: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 11, fontWeight: '600' },
  dropBox: { minWidth: 150 },
  smallBox: { minHeight: 35, paddingVertical: 4 },
  setBox: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  setBoxIcon: { width: 14, height: 14 },
  pickerNote: { fontSize: 14, padding: 14 },
  abbr: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // The Finish button in the editor (like the Card Finder's): a rounded pill
  finishPill: { minHeight: 30, minWidth: 80, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  finishText: { fontSize: 12, fontWeight: '700' },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueText: { fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { minWidth: 24, textAlign: 'center', fontSize: 13.5, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
});
