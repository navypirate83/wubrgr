/* =====================================================================
   ONE DECK (/binders/deck/<id>)
   An opened deck, with the basics of a list (see list/[id].tsx): its
   cards as a LIST or a GRID of card pictures (the buttons under the search
   bar, remembered the same way as a list's), the same sort menu, header
   bars between groups, foil borders, prices and the line of totals, the
   grid's zoom, and a download button (the deck as a .CSV file).
   From top to bottom: the search bar (see components/decks/DeckSearchBar.tsx)
   with its Search / Add switch, the List / Grid switch with the sort and
   download button, then the cards.
   - SEARCH (the switch's first position): the bar narrows the deck's own
     cards as you type, by name or type, like a list's search box.
   - ADD: type a card's name and tap the "+" on the card you want; the first
     printing that comes up is added. The drop-down closes when you tap
     anywhere else (the invisible cover below does that), and the switch
     under the bar limits the search to cards in your binders.
   - DRAGGING (computers): a card picture dragged in from Scryfall or EDHREC
     and dropped anywhere over the cards is added too, like in a list.
   Tapping a card opens its window, the same one the binders' and lists'
   cards have: a big picture (tap it to open the card in the Card Finder),
   what it does, how many copies (− and +), Move to a binder (the card
   leaves the deck and goes into the binder's first empty pocket) and
   Delete from deck (it asks first). The "− 3 +" bar on a card works as
   in a list: − on the last copy asks about deleting the card.
   Too many copies: adding a card the deck already has as many of as its
   format allows (1 in Commander-style formats, 4 in the others) shows a
   window about it, with "Add anyway" because some cards break the limit.
   Basic lands, snow-covered basic lands and Wastes never ask.
   POWER BRACKET (Commander decks only): a button under the sort bar shows the
   deck's Commander Bracket ("Bracket 3 · Upgraded", or "Set power bracket"). Tap
   it to choose one of the five, or "Not rated" (see deckBrackets.ts). It also
   shows on the deck's row on the Decks page. The deck's Game Changer cards get
   a yellow border and a small gold star (and a "GC" tag in the list view), and a
   "Game Changers only" button next to the bracket button shows just those cards; 1 to 3 of them make the deck at least Bracket 3 (3, 4 or 5
   may be chosen) and 4 or more make it at least Bracket 4 (4 or 5), and the
   other brackets are greyed out in the window.

   COMMAND ZONE (Commander-style formats): at the top of the card list (it scrolls up out of the way with the cards), one or two spots
   for the cards kept outside the deck: a commander (and a partner or a
   Background only if its abilities call for one), or an Oathbreaker and its
   signature spell (see components/decks/CommandZone.tsx and lib/deckZones.ts).
   The commanders count in the line of totals: the cards, how many different, the
   names and the price all include them (on the main deck, not the sideboard).
   A spot is filled two ways: tap it to search the cards allowed there, or open
   a card in the deck and tap "Make commander" in its window.
   SIDEBOARD (formats that have one): "Main deck" and "Sideboard" buttons
   switch between the two lists; a "+" or a dragged picture adds to the one
   showing; a card's window can move it between them.
   Picking a different printing and the format's other rules come later.
   Decks are saved on this device and in your account (see lib/deckStorage.ts
   and serverSync.ts).
   ===================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useColors } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { useAnnouncer } from '@/hooks/useAnnouncer';
import { useBinderPrices } from '@/hooks/useBinderPrices';
import { useContentWidth } from '@/hooks/useMenuStyle';
import HelpButton from '@/components/HelpButton';
import ShelfSwitch from '@/components/binders/ShelfSwitch';
import DeckSearchBar, { type DeckSearchMode } from '@/components/decks/DeckSearchBar';
import CardList, { type CardEntry } from '@/components/binder/CardList';
import ViewSwitch, { ToolButton } from '@/components/binder/ViewSwitch';
import CardScreen, { BINDER_ICON } from '@/components/binder/CardScreen';
import AddToCollectionDialog from '@/components/decks/AddToCollectionDialog';
import PopupWindow from '@/components/PopupWindow';
import Button from '@/components/Button';
import { addCardToDeck, commandCard, copiesOf, fillDeckDetails, findDeck, moveToMain, moveToSideboard, placeInCommandZone, setDeckBracket, setDeckCardCount, setDeckCards, updateDeckCard, zoneOf, type Deck, type DeckCard } from '@/lib/deckStorage';
import CommandZone from '@/components/decks/CommandZone';
import SlotSearchDialog from '@/components/decks/SlotSearchDialog';
import { allowedInSlot, deckCardFromPrint, secondSpotShows, slotHint, slotName, slotQuery, zoneExtraOf } from '@/lib/deckZones';
import { deckFormat, skipsCopyWarning } from '@/lib/deckFormats';
import { BRACKETS, bracketAllowed, bracketText, countGameChangers, effectiveBracket, hasBrackets, lowestBracket } from '@/lib/deckBrackets';
import { useGameChangers } from '@/lib/gameChangers';
import { isBanned, useBanned } from '@/lib/bannedCards';
import { deckProblems } from '@/lib/deckLegality';
import { assignPrinting, choicesFor, loadOwned, marksFor, normalizeOwnership, type Mark, type OwnedPrint } from '@/lib/deckOwnership';
import { Image } from 'expo-image';
import { pictureSource } from '@/lib/http';
import { GRID_ZOOM_WIDTHS, binderGridZoom, chooseDeckSort, deckSort, deckSortReversed, listViewMode, onBinderViewChange, onGridZoomChange, setListViewMode, sortHeadersOn } from '@/lib/binderView';
import { headerFor, sortEntries } from '@/lib/binderSort';
import { CARD_BACK, costAndType, imageFor, isDoubleSided } from '@/lib/cards';
import { useCardAreaDrop } from '@/hooks/useCardAreaDrop';
import { binderCardFrom, lookupFromDrop } from '@/lib/cardDrop';
import { isSearching, makeNameFilter } from '@/lib/nameFilter';
import { detailsOf, costAndTypeOf, finishParam } from '@/lib/cardDetails';
import { cardCount, MAX_COPIES, samePrinting } from '@/lib/binderStorage';
import { cardByNamePath, cardBySetPath, loadOneCard, type ScryfallCard } from '@/lib/scryfall';
import ImportCardsDialog from '@/components/ImportCardsDialog';
import DownloadDialog from '@/components/DownloadDialog';
import { importIntoDeck, summaryText, type ImportSummary } from '@/lib/deckImportRun';
import { copyDeckText, downloadDeckCsv, downloadDeckText } from '@/lib/binderDownload';
import { askYesNo, showMessage } from '@/lib/dialogs';

// The Card Finder's address for a card in this deck: that exact printing
// (side, language, foil), and which deck card it is (the deck and its spot),
// so the Card Finder's "+" can change that card to the printing picked
function finderLinkFor(deckId: string, index: number, card: DeckCard): string {
  const params = new URLSearchParams();
  params.set('set', card.set);
  params.set('number', card.number);
  if (card.face === 1) params.set('face', 'back');
  if (card.lang) params.set('lang', card.lang);
  const finish = finishParam(card);
  if (finish) params.set('foil', finish);
  params.set('deck', deckId);
  params.set('at', String(index));
  return `/search?${params}`;
}

export default function DeckScreen() {
  const colors = useColors();
  const { announce } = useAnnouncer();
  const navigation = useNavigation();
  const { usingBinders } = useAccount();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  // The deck (this device's copy), and the note under the search bar
  const [deck, setDeck] = useState<Deck | undefined>(() => findDeck(id));
  const [note, setNote] = useState('');
  // The search bar: Search (narrow this deck's cards) or Add, what's typed to
  // narrow them, and whether the Add drop-down is showing
  const [searchMode, setSearchMode] = useState<DeckSearchMode>('search');
  const [filter, setFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  // Which list shows (the main deck or the sideboard), and which command zone
  // spot's search window is open (null: none)
  const [tab, setTab] = useState<'main' | 'side'>('main');
  const [slotSearch, setSlotSearch] = useState<0 | 1 | null>(null);
  // The format and what it asks for outside the main deck (formats with no
  // sideboard always show the main deck)
  const format = deckFormat(deck?.format);
  const shownZone = format.sideboard > 0 ? tab : 'main';
  // A card is being looked up: don't start a second add until it's done
  const busy = useRef(false);
  // The held card's window (its spot in the deck), and the card being moved
  // to a binder (the pop-up list of binders)
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  // The deck card being added to a binder or list (its spot in the deck), for cards you don't own
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  // The import window (the upload button) and the download window (the download button)
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Is the power bracket window open?
  const [picking, setPicking] = useState(false);

  /* ----- The cards as the list and grid show them (the same as a list) ----- */

  // How the cards are shown (a list or a grid), the sort, and the grid's zoom
  const mode = useSyncExternalStore(onBinderViewChange, listViewMode, listViewMode);
  const sort = useSyncExternalStore(onBinderViewChange, deckSort, deckSort);
  const reversed = useSyncExternalStore(onBinderViewChange, deckSortReversed, deckSortReversed);
  const gridZoom = useSyncExternalStore(onGridZoomChange, binderGridZoom, binderGridZoom);
  const headersOn = useSyncExternalStore(onBinderViewChange, sortHeadersOn, sortHeadersOn);
  const contentWidth = useContentWidth();

  // Game Changers (Commander only): marked with a yellow border, and they set the lowest bracket the deck may have
  const isGameChanger = useGameChangers();
  const gameChangers = deck && hasBrackets(format.code) ? countGameChangers(deck.cards, isGameChanger) : 0;
  // The bracket the deck counts as: the one chosen, raised to the lowest allowed if it has Game Changers
  const bracket = deck && hasBrackets(format.code) ? effectiveBracket(deck.bracket, gameChangers) : undefined;
  // Showing only the Game Changer cards? (A button next to the bracket button turns it on and off.)
  const [onlyGameChangers, setOnlyGameChangers] = useState(false);

  // The cards in the list showing (the main deck or the sideboard; the command
  // zone cards have their own spots), each with its "key": its spot in the
  // deck (0 is the first), as text
  const allEntries = useMemo<CardEntry[]>(
    () => (deck?.cards ?? []).map((card, index) => ({ key: String(index), card }))
      .filter((entry) => zoneOf(entry.card as DeckCard) === shownZone),
    [deck, shownZone],
  );
  // The cards to show: all of them, or, in Search as you type, those whose
  // name matches (a forgiving search, so small typos and spacing don't
  // matter) or whose type line contains what's typed
  const searching = searchMode === 'search' && isSearching(filter);
  const nameFilter = useMemo(() => makeNameFilter(allEntries, (entry) => entry.card.name), [allEntries]);
  const baseEntries = useMemo<CardEntry[]>(() => {
    if (!searching) return allEntries;
    const byName = new Set(nameFilter(filter).map((entry) => entry.key));
    const typed = filter.trim().toLowerCase();
    return allEntries.filter((entry) => byName.has(entry.key) || ((entry.card as DeckCard).typeLine ?? '').toLowerCase().includes(typed));
  }, [searching, nameFilter, filter, allEntries]);
  // What the cards are worth, and their details from Scryfall (for sorting).
  // Looked up for the whole deck, so typing in the search box doesn't start
  // a new lookup each time.
  // The commanders (the command zone's cards) count towards the deck's total price and number of cards, so
  // they're priced too, though they aren't in the list. (On the sideboard tab they don't count.)
  const commandEntries = useMemo<CardEntry[]>(
    () => shownZone !== 'main' ? [] : (deck?.cards ?? []).map((card, index) => ({ key: String(index), card }))
      .filter((entry) => zoneOf(entry.card as DeckCard) === 'command'),
    [deck, shownZone],
  );
  const pricedEntries = useMemo(() => (commandEntries.length > 0 ? [...allEntries, ...commandEntries] : allEntries), [allEntries, commandEntries]);
  const prices = useBinderPrices(pricedEntries);
  // (with "Game Changers only" on, just those)
  const entries = useMemo<CardEntry[]>(
    () => sortEntries(
      onlyGameChangers ? baseEntries.filter((entry) => isGameChanger(entry.card.name)) : baseEntries,
      sort, reversed, { printings: prices.printings, prices: prices.eachByKey, currency: prices.currency },
    ),
    [baseEntries, onlyGameChangers, isGameChanger, gameChangers, sort, reversed, prices.printings, prices.eachByKey],
  );
  // Which group each card falls under for the sort in use, so the list can
  // put a header bar between the groups (none if turned off in Settings)
  const headerOf = useCallback(
    (entry: CardEntry) => (headersOn ? headerFor(entry, sort, { printings: prices.printings }) : null),
    [headersOn, sort, prices.printings],
  );
  // Once the lookup arrives, save the missing details with the cards (once:
  // after that they have them, so there's nothing left to fill in)
  useEffect(() => {
    if (prices.printings && fillDeckDetails(id, prices.printings)) setDeck(findDeck(id));
  }, [prices.printings, deck]);   // eslint-disable-line react-hooks/exhaustive-deps

  // What's in your binders (cards on lists don't count): each card name with
  // the printings you own and how many copies of each. From it, each deck card
  // gets a border: a card you don't own has a solid red one; a card you own,
  // but not this printing, has a dashed red one (tap it to pick a printing
  // you own). See deckOwnership.ts.
  const [owned, setOwned] = useState(loadOwned);
  const marks = useMemo(() => {
    const byCard = new Map<DeckCard, Mark>();
    if (deck) marksFor(deck.cards, owned).forEach((mark, i) => byCard.set(deck.cards[i], mark));
    return byCard;
  }, [deck, owned]);
  const isMissing = useCallback((card: { name: string }) => marks.get(card as DeckCard) ?? false, [marks]);

  // Copies of a printing the deck holds beyond what you own are split off as
  // their own entry (so each can have its own border). Done whenever the deck
  // or what you own changes; nothing changes when it's already tidy.
  useEffect(() => {
    if (!deck) return;
    const tidy = normalizeOwnership(deck.cards, owned);
    if (tidy !== deck.cards) { setDeckCards(id, tidy); setDeck(findDeck(id)); }
  }, [deck, owned]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The cards banned in this deck's format (asked from Scryfall once): they
  // get a black "BANNED" slash across their picture
  const isBannedHere = useBanned(format.code);

  // Every time this page comes into view: read the deck again (and what you own)
  useFocusEffect(useCallback(() => { setDeck(findDeck(id)); setOwned(loadOwned()); }, [id]));

  // The header: the deck's name, then the Binders / Lists / Decks switch and Help
  useLayoutEffect(() => {
    navigation.setOptions({
      title: deck?.name ?? 'Deck',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ShelfSwitch current="decks" />
          <HelpButton topic="my-binders-decks" />
        </View>
      ),
    });
  }, [navigation, deck?.name]);

  // The card to add, as the deck saves it. If you own just one printing of the
  // card, that's the printing used (with "only my binders" on, the first one
  // you own); otherwise the first printing Scryfall gives for the name (which
  // is dashed red if you own the card in another printing: you pick one).
  async function cardToAdd(name: string, ownedOnly: boolean): Promise<DeckCard> {
    const mine = loadOwned().get(name.trim().toLowerCase());
    if (mine && (mine.length === 1 || (ownedOnly && mine.length > 0))) {
      const have = mine[0].card;
      return { ...have, added: new Date().toISOString(), ...costAndTypeOf(have) };
    }
    const print = await loadOneCard(cardByNamePath(name, true));
    return {
      name: print.name,
      set: print.set,
      number: print.collector_number,
      face: 0,
      image: imageFor(print, 0, ['normal', 'large']) ?? CARD_BACK,
      added: new Date().toISOString(),
      extra: detailsOf(print),
      ...costAndType(print, 0),
    };
  }

  // Warn if the card is banned in this format, then if the deck has as many
  // copies of it as the format allows (unless it's a basic land, a
  // snow-covered basic or Wastes). True to go ahead and add it.
  async function okToAdd(name: string): Promise<boolean> {
    const format = deckFormat(deck!.format);
    if (await isBanned(format.code, name)) {
      const sure = await askYesNo(`${name} is banned`, `${name} is banned in ${format.name}. Are you sure you want to add it?`, 'Add anyway', 'Cancel');
      if (!sure) return false;
    }
    const have = copiesOf(findDeck(id), name);
    if (have < format.copyLimit || skipsCopyWarning(name)) return true;
    const why = format.copyLimit === 1
      ? `${format.name} decks are singleton: one copy of each card. (A few cards allow more.)`
      : `${format.name} decks allow up to ${format.copyLimit} copies of a card. (A few cards allow more.)`;
    return askYesNo(`${name} is already in this deck`, `The deck has ${have} ${have === 1 ? 'copy' : 'copies'}. ${why}`, 'Add anyway', 'Cancel');
  }

  // A "+" in the search: warn if the deck has as many as its format allows,
  // then add one copy
  async function add(name: string, ownedOnly: boolean) {
    if (!deck || busy.current) return;
    busy.current = true;
    try {
      if (!(await okToAdd(name))) return;
      const card = await cardToAdd(name, ownedOnly);
      addCardToDeck(id, card, shownZone);
      setDeck(findDeck(id));
      setNote(`Added ${card.name}${shownZone === 'side' ? ' to the sideboard' : ''}.`);
    } catch (err) {
      showMessage('Couldn\'t add the card', (err as Error).message);
    } finally {
      busy.current = false;
    }
  }

  // One more or one fewer copy of the card at this spot, the same as in a
  // list. "−" on the last copy is a delete (it asks first).
  function changeCopies(index: number, step: number) {
    const card = deck?.cards[index];
    if (!card) return;
    const count = cardCount(card);
    if (step < 0 && count === 1) { confirmDelete(index); return; }
    const now = Math.min(MAX_COPIES, count + step);
    if (now === count) return;
    setDeckCardCount(id, index, now);
    setDeck(findDeck(id));
    announce(`${now} ${now === 1 ? 'copy' : 'copies'} of ${card.name}.`);
  }

  /* ----- Dropping a picture from another website (computers) ----- */

  // Let go anywhere over the cards and the card is added: one more copy if
  // that exact printing is already in the deck, otherwise at the end. (After
  // the same warning about too many copies as the "+".) The view shows it
  // wherever the sort in use puts it, scrolls to it, and highlights it for a
  // moment.
  const listAreaRef = useRef<ComponentRef<typeof View>>(null);
  const [dropOver, setDropOver] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function flash(key: string, text: string) {
    setFlashKey(key);
    setAddedNote(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => { setFlashKey(null); setAddedNote(null); }, 3000);
  }
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  useCardAreaDrop({
    areaRef: listAreaRef,
    enabled: true,
    onOver: setDropOver,
    onDrop: (dataTransfer) => { handleAreaDrop(dataTransfer); },
  });
  async function handleAreaDrop(dataTransfer: DataTransfer) {
    // (Read what was dropped now: the browser only allows it right away.)
    const lookup = lookupFromDrop(dataTransfer);
    if (!lookup) {
      showMessage('Couldn\'t add that', 'That isn\'t a card picture from Scryfall or EDHREC.');
      return;
    }
    if (!deck || busy.current) return;
    busy.current = true;
    try {
      const print = await loadOneCard(lookup.path);
      const face = isDoubleSided(print) ? lookup.face : 0;
      const card: DeckCard = { ...binderCardFrom(print, lookup.face), ...costAndType(print, face) };
      if (!(await okToAdd(card.name))) return;
      const current = findDeck(id);
      if (!current) return;
      const index = current.cards.findIndex((existing) => samePrinting(existing, card) && zoneOf(existing) === shownZone);
      addCardToDeck(id, card, shownZone);
      setDeck(findDeck(id));
      flash(String(index >= 0 ? index : current.cards.length), `✓ Added ${card.name}${index >= 0 ? ' (one more copy)' : ''}`);
      announce(`Added ${card.name}${index >= 0 ? ', one more copy' : ''}.`);
    } catch (err) {
      showMessage('Couldn\'t add the card', (err as Error).message);
    } finally {
      busy.current = false;
    }
  }

  /* ----- The command zone, and moving cards between the lists ----- */

  // Open the search window for a command zone spot (the signature spell
  // waits for an Oathbreaker)
  function openSlot(slot: 0 | 1) {
    if (!slotQuery(format, slot, commandCard(findDeck(id), 0))) {
      showMessage('Choose your Oathbreaker first', 'The signature spell has to fit the Oathbreaker\'s colors.');
      return;
    }
    setSlotSearch(slot);
  }

  // Put a card in a spot. If the spot is the first one and a second card
  // already sits in the second spot, check that card still fits the new first
  // card; if not, ask before moving it back into the main deck (and cancel
  // the change if the answer is no). "from" is where the card is in the deck
  // already, or leave it out for a new card.
  async function placeInSlot(slot: 0 | 1, card: DeckCard, print: ScryfallCard, from?: number) {
    const now = findDeck(id);
    if (!now) return;
    const second = commandCard(now, 1);
    if (slot === 0 && second) {
      const newFirst: DeckCard = { ...card, extra: { ...card.extra, ...zoneExtraOf(print) } };
      if (!(await allowedInSlot(format, 1, newFirst, second.name))) {
        const yes = await askYesNo(`${second.name} doesn't go with ${card.name}`,
          `${second.name} can't stay in the command zone with ${card.name}. It moves back into the main deck.`, 'Move it back', 'Cancel');
        if (!yes) return;
        const again = findDeck(id)!;
        moveToMain(id, again.cards.indexOf(commandCard(again, 1)!));
      }
    }
    // (Moving a card back may have shifted the card's place in the deck, so find it again)
    const current = findDeck(id)!;
    const spot = from === undefined ? undefined : current.cards.findIndex((c) => samePrinting(c, now.cards[from]) && zoneOf(c) === zoneOf(now.cards[from]));
    placeInCommandZone(id, slot, card, spot === undefined || spot < 0 ? undefined : spot, zoneExtraOf(print));
    setDeck(findDeck(id));
  }

  // A card was picked in a spot's search window
  async function chooseForSlot(slot: 0 | 1, print: ScryfallCard) {
    setSlotSearch(null);
    if (busy.current) return;
    busy.current = true;
    try {
      const card = deckCardFromPrint(print);
      await placeInSlot(slot, card, print);
      setNote(`${card.name} is your ${slotName(format, slot, commandCard(findDeck(id), 0)).toLowerCase()}.`);
    } catch (err) {
      showMessage('Couldn\'t choose the card', (err as Error).message);
    } finally {
      busy.current = false;
    }
  }

  // "Make commander" in a card's window (Make Oathbreaker or Make signature
  // spell in Oathbreaker): the card goes in the spot it fits, if the format
  // allows it there. A spot that already has a card asks first.
  async function makeCommander(index: number) {
    const card = deck!.cards[index];
    setMenuIndex(null);
    if (busy.current) return;
    busy.current = true;
    try {
      const print = await loadOneCard(cardBySetPath(card.set, card.number));
      const first = commandCard(findDeck(id), 0);
      const types = (print.type_line ?? print.card_faces?.[0]?.type_line ?? '').toLowerCase();
      let slot: 0 | 1;
      if (format.command?.kind === 'oathbreaker') slot = types.includes('planeswalker') ? 0 : 1;
      else if (first && secondSpotShows(format, first) && !commandCard(findDeck(id), 1)) slot = 1;
      else slot = 0;
      if (slot === 1 && format.command?.kind === 'oathbreaker' && !first) {
        showMessage('Choose your Oathbreaker first', 'The signature spell has to fit the Oathbreaker\'s colors.');
        return;
      }
      if (!(await allowedInSlot(format, slot, first, card.name))) {
        showMessage('Not allowed there', `${card.name} can't be your ${slotName(format, slot, first).toLowerCase()}. ${slotHint(format, slot, first)}.`);
        return;
      }
      const old = commandCard(findDeck(id), slot);
      if (old) {
        const yes = await askYesNo(`Replace ${old.name}?`,
          `${card.name} becomes your ${slotName(format, slot, first).toLowerCase()}, and ${old.name} goes back into the main deck.`, 'Replace', 'Cancel');
        if (!yes) return;
      }
      await placeInSlot(slot, card, print, index);
      setNote(`${card.name} is your ${slotName(format, slot, commandCard(findDeck(id), 0)).toLowerCase()}.`);
    } catch (err) {
      showMessage('Couldn\'t move the card', (err as Error).message);
    } finally {
      busy.current = false;
    }
  }

  // "Move to deck" on a spot: the card goes back into the main deck. Taking out
  // the first card also takes out the second (it needs a commander): ask first.
  async function moveSlotToDeck(slot: 0 | 1) {
    const now = findDeck(id);
    const card = commandCard(now, slot);
    if (!now || !card) return;
    const second = slot === 0 ? commandCard(now, 1) : undefined;
    if (second) {
      const yes = await askYesNo(`Move ${card.name} back into the deck?`, `${second.name} moves back too, since it needs it.`, 'Move both', 'Cancel');
      if (!yes) return;
      moveToMain(id, now.cards.indexOf(second));
    }
    const again = findDeck(id)!;
    moveToMain(id, again.cards.indexOf(commandCard(again, slot)!));
    setDeck(findDeck(id));
  }

  // "Move to sideboard" / "Move to main deck" in a card's window
  function moveCardTo(index: number, where: 'main' | 'side') {
    const card = deck?.cards[index];
    setMenuIndex(null);
    if (!card) return;
    if (where === 'side') moveToSideboard(id, index); else moveToMain(id, index);
    setDeck(findDeck(id));
    announce(`${card.name} is now in the ${where === 'side' ? 'sideboard' : 'main deck'}.`);
  }

  // Is the card whose window is open allowed in the command zone? The "Make
  // commander" button (Make Oathbreaker / Make signature spell) only shows when
  // it is. The spot it would go in is worked out the same way as when the button
  // is pressed; the answer comes from the same Scryfall search that fills the
  // spot's own search window, and is remembered, so reopening a card is instant.
  const [canMake, setCanMake] = useState(false);
  const allowedCache = useRef(new Map<string, boolean>());
  useEffect(() => {
    setCanMake(false);
    const card = menuIndex !== null ? deck?.cards[menuIndex] : undefined;
    if (!deck || !card || !format.command || zoneOf(card) !== 'main') return undefined;
    const first = commandCard(deck, 0);
    const types = (card.typeLine ?? '').toLowerCase();
    let slot: 0 | 1 | null;
    if (format.command.kind === 'oathbreaker') {
      slot = types.includes('planeswalker') ? 0 : /instant|sorcery/.test(types) ? 1 : null;
      if (slot === 1 && !first) slot = null;   // the signature spell waits for an Oathbreaker
    } else {
      slot = first && secondSpotShows(format, first) && !commandCard(deck, 1) ? 1 : 0;
    }
    if (slot === null) return undefined;
    const key = `${format.code}|${slot}|${first?.name ?? ''}|${first?.extra?.Pairing ?? ''}|${card.name}`;
    const known = allowedCache.current.get(key);
    if (known !== undefined) { setCanMake(known); return undefined; }
    let stale = false;
    allowedInSlot(format, slot, first, card.name)
      .then((ok) => { allowedCache.current.set(key, ok); if (!stale) setCanMake(ok); })
      .catch(() => { /* couldn't ask: the button just doesn't show */ });
    return () => { stale = true; };
  }, [menuIndex, deck, format]);

  // A version that never changes between redraws, for the rows
  const copiesRef = useRef(changeCopies);
  copiesRef.current = changeCopies;
  const onCopies = useCallback((key: string, step: number) => copiesRef.current(Number(key), step), []);

  // "Delete from deck": ask, then take the card out
  async function confirmDelete(index: number) {
    const card = deck!.cards[index];
    setMenuIndex(null);
    const yes = await askYesNo(`Delete ${card.name}?`, `Take it out of ${deck!.name}.`, 'Yes, delete', 'No');
    if (!yes) return;
    setDeckCardCount(id, index, 0);
    setDeck(findDeck(id));
  }

  // The window's printing choices: a tap on one of the printings you own
  // switches as many copies of the card as you own of it. If copies are left
  // over, the window stays open for them (tap Done to stop); once every copy
  // has switched, it closes.
  function pickPrinting(print: OwnedPrint) {
    if (!deck || menuIndex === null) return;
    const before = deck.cards[menuIndex];
    const done = assignPrinting(deck.cards, menuIndex, print, owned);
    if (!before || !done) return;
    setDeckCards(id, done.cards);
    setDeck(findDeck(id));
    announce(`${before.name} now uses ${print.card.set.toUpperCase()} number ${print.card.number}.`);
    if (done.all) { setMenuIndex(null); return; }
    const left = done.cards.findIndex((c) => c.name === before.name && samePrinting(c, before) && zoneOf(c) === zoneOf(before));
    setMenuIndex(left >= 0 ? left : null);
  }

  // "Add to a binder/list" (a card you don't own): close this window, then open
  // the choice of a binder or a list. (iPhones can't open one pop-up while
  // another is still fading away, so there it waits a moment.)
  function addToCollection(index: number) {
    setMenuIndex(null);
    setTimeout(() => setAddingIndex(index), Platform.OS === 'ios' ? 350 : 0);
  }

  // The card is now in a binder or on a list. It stays in the deck; what you
  // own is read again, so a card that's now in a binder loses its red border.
  function addedToCollection(addedNote: string) {
    setOwned(loadOwned());
    setAddingIndex(null);
    setNote(addedNote);
    announce(addedNote);
  }

  if (!usingBinders) return <Redirect href="/binders" />;
  // No such deck (deleted, or a wrong address)
  if (!deck) {
    return (
      <View style={styles.missing}>
        <Text style={[styles.missingText, { color: colors.muted }]}>This deck isn't here (it may have been deleted).</Text>
      </View>
    );
  }

  // Why the deck isn't legal (too many cards, or banned cards in it): empty if nothing is wrong
  const problems = deckProblems(deck, format, isBannedHere);

  const menuCard = menuIndex !== null ? deck.cards[menuIndex] : undefined;
  const addingCard = addingIndex !== null ? deck.cards[addingIndex] : undefined;
  // The printings you own that this card could switch to
  const menuChoices = menuIndex !== null ? choicesFor(deck.cards, menuIndex, owned) : [];

  // The power bracket button (and the Game Changers filter), shown in the list's top part under the command zone
  const bracketRow = (
    <View style={styles.chipRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Power bracket: ${bracket ? bracketText(bracket) : 'not rated'}${gameChangers > 0 ? `, ${gameChangers} Game Changers` : ''}. Tap to change.`}
                     onPress={() => setPicking(true)}
                     style={[styles.bracketChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="flame-outline" size={16} color={bracket ? colors.accent : colors.muted} />
            <Text style={[styles.bracketText, { color: bracket ? colors.text : colors.muted }]}>
              {bracket ? bracketText(bracket) : 'Set power bracket'}
              {gameChangers > 0 ? ` · ${gameChangers} Game Changer${gameChangers === 1 ? '' : 's'}` : ''}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.muted} />
          </Pressable>
          {/* Show just the Game Changer cards (only offered when the deck has some, or while it's on) */}
          {(gameChangers > 0 || onlyGameChangers) && (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: onlyGameChangers }}
                       accessibilityLabel={onlyGameChangers ? 'Showing only Game Changers. Tap to show every card.' : 'Show only Game Changers'}
                       onPress={() => setOnlyGameChangers((on) => !on)}
                       style={[styles.bracketChip, { borderColor: onlyGameChangers ? colors.gameChanger : colors.border, backgroundColor: onlyGameChangers ? colors.gameChanger : colors.surface }]}>
              <Ionicons name="star" size={14} color={onlyGameChangers ? '#1a1206' : colors.gameChanger} />
              <Text style={[styles.bracketText, { color: onlyGameChangers ? '#1a1206' : colors.text }]}>Game Changers only</Text>
            </Pressable>
          )}
          </View>
  );

  return (
    // The keyboard pushes everything up instead of covering the search bar
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      {/* The search bar for adding cards (its drop-down floats over the
          cards below), and the List / Grid switch with the sort and the
          download button */}
      <View style={styles.top}>
        <DeckSearchBar
          mode={searchMode} onMode={setSearchMode}
          filter={filter} onFilter={setFilter}
          open={addOpen} onOpenChange={setAddOpen}
          onAdd={add} note={note}
        />
        <ViewSwitch
          mode={mode} sort={sort} reversed={reversed} onSort={chooseDeckSort} modes={['list', 'grid']} onView={setListViewMode}
          extras={(
            // Import a decklist into this deck, and download the deck (.CSV, .TXT or copy)
            <>
              <ToolButton icon="cloud-upload-outline" label={`Import a decklist into ${deck.name}`} onPress={() => setImporting(true)} />
              <ToolButton icon="download-outline" label={`Download ${deck.name}`} onPress={() => setDownloading(true)} />
            </>
          )}
        />
        {/* Formats with a sideboard: switch between the main deck and the sideboard */}
        {format.sideboard > 0 && (
          <View style={styles.tabs}>
            {(['main', 'side'] as const).map((which) => {
              const count = deck.cards.filter((c) => zoneOf(c) === which).reduce((sum, c) => sum + cardCount(c), 0);
              const chosen = shownZone === which;
              return (
                <Pressable key={which} accessibilityRole="button" accessibilityState={{ selected: chosen }}
                           onPress={() => setTab(which)}
                           style={[styles.tab, { borderColor: chosen ? colors.accent : colors.border, backgroundColor: chosen ? colors.accent : 'transparent' }]}>
                  <Text style={[styles.tabText, { color: chosen ? colors.accentText : colors.text }]}>
                    {which === 'main' ? `Main deck ${count}` : `Sideboard ${count} of ${format.sideboard}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* THE CARDS, with a picture dragged over them outlined */}
      <View ref={listAreaRef} style={styles.listArea} collapsable={false}>
        <CardList
          entries={entries}
          flashKey={flashKey}
          mode={mode}
          width={contentWidth}
          onPick={(key) => setMenuIndex(Number(key))}
          onCopies={onCopies}
          minTile={GRID_ZOOM_WIDTHS[gridZoom]}
          prices={prices}
          headerOf={headerOf}
          missing={isMissing}
          banned={(card) => isBannedHere(card.name)}
          gameChanger={hasBrackets(format.code) ? (card) => isGameChanger(card.name) : undefined}
          warn={problems.length > 0 ? problems.join(', ') : undefined}
          // THE COMMAND ZONE (formats that have one) is the top of the list, so it scrolls up out of the way, and
          // the commanders are counted in the line of totals
          header={format.command || hasBrackets(format.code)
            ? (
              <View>
                {/* The command zone, with the power bracket button right under it */}
                {format.command && (
                  <CommandZone deck={deck} onChoose={openSlot} onOpenCard={setMenuIndex} onMoveToDeck={moveSlotToDeck} missing={isMissing} banned={isBannedHere} gameChanger={hasBrackets(format.code) ? isGameChanger : undefined} />
                )}
                {hasBrackets(format.code) && bracketRow}
              </View>
            )
            : undefined}
          alsoCounted={commandEntries}
          // The format, at the end of the line of totals (and how many cards aren't in your binders, and the card just dropped)
          note={[format.name, deck.cards.some((c) => c.zone === 'command') ? `${deck.cards.filter((c) => c.zone === 'command').length} in command zone, included` : '', deck.cards.some((c) => isMissing(c) === 'card') ? `${deck.cards.filter((c) => isMissing(c) === 'card').reduce((sum, c) => sum + cardCount(c), 0)} not in your binders` : '', addedNote].filter(Boolean).join(' · ')}
          searchOf={searching ? allEntries.length : undefined}
          // No cards yet (or none matching the search)
          empty={(
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{onlyGameChangers && !searching ? 'No Game Changers here' : searching ? 'No cards match' : shownZone === 'side' ? 'No sideboard cards yet' : 'No cards yet'}</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {onlyGameChangers && !searching ? 'None of the cards in this list is a Game Changer. Tap Game Changers only to show every card again.' : searching ? `None of the ${allEntries.length} cards match "${filter.trim()}".` : shownZone === 'side' ? 'The sideboard is empty. Flip the switch to Add, search for a card and tap the + on it, or move a card here from its window.' : 'Flip the switch to Add, search for a card and tap the + on it.'}
              </Text>
            </View>
          )}
        />
        {dropOver && <View pointerEvents="none" style={[styles.dropOutline, { borderColor: colors.accent }]} />}
      </View>

      {/* While the Add drop-down is open, an invisible cover over everything
          below the bar: tapping anywhere closes the drop-down */}
      {searchMode === 'add' && addOpen && (
        <Pressable accessibilityLabel="Close the card search" style={styles.cover} onPress={() => setAddOpen(false)} />
      )}

      {/* THE CARD SCREEN: its picture (tap it to open the card in the Card
          Finder), how many copies, Open in Card Finder, then the deck's own
          buttons (command zone, sideboard, add to a binder or list, delete),
          and the rules folded away (see CardScreen.tsx) */}
      {menuCard && menuIndex !== null && (
        <CardScreen
          card={menuCard}
          where={{ kind: 'deck', name: deck?.name ?? '' }}
          copies={zoneOf(menuCard) === 'command' ? undefined : {
            count: cardCount(menuCard), max: MAX_COPIES,
            lessLabel: cardCount(menuCard) > 1 ? 'One fewer copy' : 'Delete from deck',
            onLess: () => changeCopies(menuIndex, -1),
            onMore: () => changeCopies(menuIndex, 1),
          }}
          onChange={(edit) => { updateDeckCard(id, menuIndex, edit); setDeck(findDeck(id)); }}
          onOpenFinder={() => { const card = menuCard; const spot = menuIndex; setMenuIndex(null); router.push(finderLinkFor(id, spot, card) as never); }}
          onClose={() => setMenuIndex(null)}
          actions={[
            /* The command zone: put this card in its spot (or take it back out) */
            ...(format.command && zoneOf(menuCard) === 'main' && canMake ? [{
              label: format.command.kind === 'oathbreaker'
                ? ((menuCard.typeLine ?? '').includes('Planeswalker') ? 'Make Oathbreaker' : 'Make signature spell')
                : 'Make commander',
              icon: 'star-outline' as const, onPress: () => makeCommander(menuIndex),
            }] : []),
            /* The sideboard */
            ...(format.sideboard > 0 && zoneOf(menuCard) === 'main'
              ? [{ label: 'Move to sideboard', icon: 'arrow-down-outline' as const, onPress: () => moveCardTo(menuIndex, 'side') }] : []),
            ...(zoneOf(menuCard) === 'side'
              ? [{ label: 'Move to main deck', icon: 'arrow-up-outline' as const, onPress: () => moveCardTo(menuIndex, 'main') }] : []),
            ...(zoneOf(menuCard) === 'command'
              ? [{ label: 'Move to main deck', icon: 'arrow-up-outline' as const, onPress: () => { const slot = menuCard.slot ?? 0; setMenuIndex(null); moveSlotToDeck(slot); } }] : []),
            /* A card you don't own (a solid red border), or a printing or finish (say foil) you don't own (a dashed border): add it to a binder (you own it, it's just not in your collection yet) or a list (a wishlist) */
            ...(marks.get(menuCard) === 'card' || marks.get(menuCard) === 'printing'
              ? [{ label: 'Add to a binder/list', picture: BINDER_ICON, plus: true, onPress: () => addToCollection(menuIndex) }] : []),
            { label: 'Delete from deck', icon: 'trash-outline' as const, kind: 'danger' as const, onPress: () => confirmDelete(menuIndex) },
          ]}
        >
          {/* The printings you own of this card (a dashed red border): tap one to use it */}
          {marks.get(menuCard) === 'printing' && menuChoices.length > 0 && (
            <View style={styles.printings}>
              <Text style={[styles.printingsText, { color: colors.text }]}>
                You don't own this exact version{menuCard.foil ? ' (foil)' : ''}, but you own other versions of the card. Tap one to use it{cardCount(menuCard) > 1 ? ` (it takes as many of the ${cardCount(menuCard)} copies as you own of it)` : ''}.
              </Text>
              <View style={styles.printRow}>
                {menuChoices.map(({ print, free }) => (
                  <Pressable key={print.key} accessibilityRole="button"
                             accessibilityLabel={`Use ${print.card.set.toUpperCase()} number ${print.card.number}, you own ${free}`}
                             onPress={() => pickPrinting(print)} style={({ pressed }) => [styles.printChoice, pressed && { opacity: 0.6 }]}>
                    <Image source={pictureSource(print.card.image)} style={styles.printPicture} contentFit="cover" />
                    <Text style={[styles.printLabel, { color: colors.muted }]} numberOfLines={1}>
                      {print.card.set.toUpperCase()} #{print.card.number}{print.card.foil ? ' foil' : ''}{free > 1 ? ` ×${free}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button label="Done" kind="secondary" onPress={() => setMenuIndex(null)} />
            </View>
          )}
        </CardScreen>
      )}

      {/* THE POWER BRACKET WINDOW: the five brackets, and "Not rated". Tapping one saves it and closes the window. */}
      {picking && (
        <PopupWindow title="Power bracket" onClose={() => setPicking(false)}
                     buttons={[{ label: 'Close', onPress: () => setPicking(false), kind: 'secondary' }]}>
          <View style={styles.bracketList}>
            {/* Game Changers in the deck limit the choices: the ones below the lowest allowed are greyed out */}
            {gameChangers > 0 && (
              <Text style={{ color: colors.muted, fontSize: 14 }}>
                This deck has {gameChangers} Game Changer{gameChangers === 1 ? '' : 's'} (the cards with a yellow border), so it must be Bracket {lowestBracket(gameChangers)} or higher.
              </Text>
            )}
            {BRACKETS.map((b) => {
              const chosen = bracket === b.n;
              const allowed = bracketAllowed(b.n, gameChangers);
              return (
                <Pressable key={b.n} accessibilityRole="button" accessibilityState={{ selected: chosen, disabled: !allowed }}
                           accessibilityLabel={`Bracket ${b.n}, ${b.name}. ${b.about}${allowed ? '' : ' Not allowed with this deck\'s Game Changers.'}`}
                           disabled={!allowed}
                           onPress={() => { setDeckBracket(id, b.n); setDeck(findDeck(id)); setPicking(false); }}
                           style={[styles.bracketOption, { borderColor: chosen ? colors.accent : colors.border, backgroundColor: chosen ? colors.accent : 'transparent', opacity: allowed ? 1 : 0.4 }]}>
                  <Text style={[styles.bracketOptionName, { color: chosen ? colors.accentText : colors.text }]}>{b.n} · {b.name}</Text>
                  <Text style={{ color: chosen ? colors.accentText : colors.muted, fontSize: 13 }}>{b.about}</Text>
                </Pressable>
              );
            })}
            <Button label="Not rated" kind="secondary" disabled={gameChangers > 0} onPress={() => { setDeckBracket(id, undefined); setDeck(findDeck(id)); setPicking(false); }} />
          </View>
        </PopupWindow>
      )}

      {/* The upload button: a pasted list, a link, or a file, added to this deck */}
      {importing && (
        <ImportCardsDialog
          title="Import a decklist"
          run={(imported) => importIntoDeck(id, imported)}
          onCancel={() => setImporting(false)}
          onDone={(summary: ImportSummary) => {
            setImporting(false);
            setDeck(findDeck(id));
            setOwned(loadOwned());
            if (summary.notFound.length > 0) showMessage('Import finished', summaryText(summary));
            else { setNote(summaryText(summary)); announce(summaryText(summary)); }
          }}
        />
      )}

      {/* The download button: a .CSV file, a .TXT file, or copy the list */}
      {downloading && (
        <DownloadDialog title="Download this deck" csv={() => downloadDeckCsv(id)} text={() => downloadDeckText(id)} copy={() => copyDeckText(id)}
                        onClose={() => setDownloading(false)}
                        onCopied={() => { setNote('List copied.'); announce('List copied to the clipboard.'); }} />
      )}

      {/* A command zone spot's search window: only cards allowed in the spot */}
      {slotSearch !== null && slotQuery(format, slotSearch, commandCard(deck, 0)) && (
        <SlotSearchDialog
          title={`Choose your ${slotName(format, slotSearch, commandCard(deck, 0)).toLowerCase()}`}
          query={slotQuery(format, slotSearch, commandCard(deck, 0))!}
          hint={slotHint(format, slotSearch, commandCard(deck, 0))}
          onChoose={(print) => chooseForSlot(slotSearch, print)}
          onCancel={() => setSlotSearch(null)}
        />
      )}

      {/* "Add to a binder/list": choose a binder (you own it) or a list (a wishlist) */}
      {addingCard && (
        <AddToCollectionDialog card={addingCard} haveOtherVersion={marks.get(addingCard) === 'printing'} onDone={addedToCollection} onCancel={() => setAddingIndex(null)} />
      )}
    </KeyboardAvoidingView>
  );
}

// The screen's look: the search bar and switch at the top, the cards
// filling the rest
const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 8, zIndex: 10 },
  listArea: { flex: 1 },
  // The Main deck / Sideboard buttons
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  // The power bracket button, and the window's choices
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bracketChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  bracketText: { fontSize: 14, fontWeight: '600' },
  bracketList: { gap: 8 },
  bracketOption: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  bracketOptionName: { fontSize: 16, fontWeight: '700' },
  dropOutline: { position: 'absolute', top: 4, left: 8, right: 8, bottom: 4, borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, zIndex: 25 },
  // The invisible cover: it sits above the cards but below the search bar (which has zIndex 10)
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  empty: { alignItems: 'center', gap: 8, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, marginTop: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center' },
  // The card's window: the copies, then the buttons
  printings: { gap: 10, alignItems: 'center' },
  printingsText: { fontSize: 14, textAlign: 'center' },
  printRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  printChoice: { alignItems: 'center', gap: 4, width: 84 },
  printPicture: { width: 84, height: 117, borderRadius: 6 },
  printLabel: { fontSize: 12 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missingText: { fontSize: 16, textAlign: 'center' },
});
