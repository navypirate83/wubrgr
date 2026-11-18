/* =====================================================================
   THE SCAN SCREEN (shared by Android and the website)
   The camera (ScannerCamera.web.tsx or ScannerCamera.native.tsx, picked when
   the app is built) reads a card and hands over the raw text. This screen works
   out which printing it is (lib/scanner/scanResolve.ts, from the catalogue on
   the device, so with no internet) and runs the scanning:
   ONE CARD mode: a sure or likely match slides up the confirm sheet (picture,
     name, set and number, how many, finish, language, "Add to binder", "Wrong
     printing?"); a card that could be several printings opens the printing
     picker first. "Add to binder" asks which binder, and the card goes in.
   STACK mode: each scan goes straight into a running list (a card scanned again
     adds a copy). A sure match is just added, with a buzz; a card it wasn't sure of
     is added with an orange dashed border (PICK a printing, or FIX one it couldn't
     read) to sort out at the end. The list button (with the count) opens the list,
     where a row can be changed or taken off, and "Add N to binder" adds the lot.
   Nothing is ever added to a binder without choosing the binder, and a card the
   scanner wasn't sure of is never added by itself.
   The first time, with no catalogue on the device, it asks before downloading.
   THE GEAR BUTTON (beside the scan button) opens the scanner options (ScanSettingsSheet.tsx): lock to
   a set, what to do when unsure, which finish to start with, and whether to show scan times. All
   optional, and saved on this device. A locked set shows its code beside the gear.
   THE QUEUE: in Stack mode the camera doesn't wait for a card to be worked out before it takes the next
   photo (on Android, a few at a time). The number still being worked out is shown beside the count on the
   list button ("12+2"), and each card joins the list as soon as it's ready.
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ScannerCamera from './ScannerCamera';
import ScanSettingsSheet from './ScanSettingsSheet';
import ConfirmSheet from './ConfirmSheet';
import PrintingPicker from './PrintingPicker';
import StackList from './StackList';
import AddToBinderDialog from './AddToBinderDialog';
import { useColors } from '@/hooks/useTheme';
import { useScanOptions } from '@/hooks/useScanOptions';
import { askYesNo } from '@/lib/dialogs';
import { hapticTap } from '@/lib/haptics';
import type { Finish } from '@/lib/cards';
import type { CatalogueInfo, Printing } from '@/lib/scanner/core/catalogueTypes';
import type { ScanReading } from '@/lib/scanner/core/scannerTypes';
import { resolveReading, type ScanOutcome } from '@/lib/scanner/scanResolve';
import { timingWords } from '@/lib/scanner/core/readPlan';
import { changeScanOptions, getScanOptions } from '@/lib/scanner/scanSettings';
import { finishesOf, newScanId, startingFinish, startingFinishFor, type ScanItem } from '@/lib/scanner/scanItems';
import { allFrontNames, catalogueConfigured, downloadCatalogue, openCatalogue, printingsNamed, type DownloadStage } from '@/lib/scanner/catalogue/catalogue';
import { looksLikeAnyName } from '@/lib/scanner/core/fuzzy';
import { normalizeName } from '@/lib/scanner/core/text';

const STAGE_WORDS: Record<DownloadStage, string> = { downloading: 'Downloading', unpacking: 'Unpacking', saving: 'Saving' };

// The card on the confirm sheet: the item, whether the scanner was only "likely" sure, whether it's
// a card already in the stack list being changed, and the scan it came from
type SheetState = { item: ScanItem; likely: boolean; fromList: boolean };
// The picker: what it's choosing for, and what to do with the choice
type PickerState = { name: string; candidates: Printing[]; matched?: number; chosen: Printing | null; artPreview?: string; reason?: string; apply: (printing: Printing) => void };

// An item for a printing, with the language read from the card (or the printing's own), and the finish
// chosen in the scanner options ("start cards as") when the printing comes in it
function itemFor(outcome: ScanOutcome, printing: Printing, flag: ScanItem['flag'], start: 'nonfoil' | 'foil' = 'nonfoil'): ScanItem {
  return {
    id: newScanId(), printing, lang: outcome.lang ?? printing.lang ?? 'en', finish: startingFinishFor(printing, start), count: 1,
    flag, candidates: outcome.candidates, matched: outcome.matched, reading: outcome.reading,
  };
}

export default function ScanScreen() {
  const colors = useColors();
  const [catalogue, setCatalogue] = useState<CatalogueInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<'one' | 'stack'>('one');
  const [items, setItems] = useState<ScanItem[]>([]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [adding, setAdding] = useState<{ items: ScanItem[]; after: () => void } | null>(null);
  const [message, setMessage] = useState('');
  // The scanner options sheet (the gear button), and how many scans are still being worked out in the queue
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const options = useScanOptions();
  // Every card's name in the plain form, once the catalogue is open (to tell whether some text is a name)
  const names = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A short line on the camera for a few seconds
  const say = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 3500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* ----- the catalogue: opened, or offered for download the first time ----- */
  useEffect(() => {
    (async () => {
      let info: CatalogueInfo | null = null;
      try { info = await openCatalogue(); } catch (err) { say((err as Error).message); }
      setCatalogue(info);
      if (info) allFrontNames().then((list) => { names.current = list; }).catch(() => { /* a scan reports it */ });
      if (info || !catalogueConfigured()) return;
      const yes = await askYesNo(
        'Get the card catalogue?',
        'The scanner needs a list of every card to tell which one you\'re holding. It is a large download, and once it\'s on this device scanning works with no internet.',
        'Download', 'Not now',
      );
      if (!yes) return;
      try {
        setCatalogue(await downloadCatalogue((stage, fraction) => setMessage(`${STAGE_WORDS[stage]}${fraction !== null ? ` ${Math.round(fraction * 100)}%` : '…'}`)));
        allFrontNames().then((list) => { names.current = list; }).catch(() => { /* a scan reports it */ });
        say('The catalogue is ready.');
      } catch (err) {
        say((err as Error).message);
      }
    })();
  }, [say]);

  /* ----- the stack list ----- */
  // Put a card on the list: scanned again, a sure card just adds a copy
  function addToList(item: ScanItem) {
    setItems((list) => {
      const same = !item.flag && list.find((other) => !other.flag && other.printing.id === item.printing.id && other.lang === item.lang && other.finish === item.finish);
      return same ? list.map((other) => (other === same ? { ...other, count: other.count + item.count } : other)) : [...list, item];
    });
  }
  const changeInList = (item: ScanItem) => setItems((list) => list.map((other) => (other.id === item.id ? item : other)));

  /* ----- a card was scanned ----- */
  // The camera hands over each reading here. The count of scans still being worked out goes up while this one
  // is, and the camera (in Stack mode) may already be taking the next photo meanwhile: the queue.
  async function onReading(reading: ScanReading) {
    setPending((n) => n + 1);
    try {
      await handleReading(reading);
    } finally {
      setPending((n) => n - 1);
    }
  }

  // Work out one reading and put the result where it goes (the options are read as they are right now)
  async function handleReading(reading: ScanReading) {
    if (!catalogue) { say('Get the card catalogue first (Settings → Card catalogue).'); return; }
    const chosen = getScanOptions();
    const lookupStart = Date.now();
    const outcome = await resolveReading(reading, { lockedSet: chosen.lockedSet?.code ?? null });
    // How long each step took (the extra clues, if they were needed, are counted as their own step), if the options say to show it
    const times = { ...reading.timings };
    times.lookup = Date.now() - lookupStart - (times.clues ?? 0);
    const timeText = chosen.showTimings ? timingWords(times) : '';
    const took = timeText ? ` · ${timeText}` : '';
    if (outcome.status === 'none') { say(`Couldn't read that card. Try again, closer and with more light.${took}`); return; }
    hapticTap();
    const art = reading.extras?.artPreview;
    // "Best guess": a card that could be several printings is taken as its most likely one, without asking
    const guess = chosen.unsure === 'guess';
    if (mode === 'one') {
      if (outcome.status === 'sure' || outcome.status === 'likely' || (guess && outcome.candidates.length > 0)) {
        const printing = outcome.printing ?? outcome.candidates[0];
        setSheet({ item: itemFor(outcome, printing, null, chosen.startFinish), likely: outcome.status !== 'sure', fromList: false });
        if (timeText) say(`Read in ${timeText}`);
      } else {
        setPicker({
          name: outcome.candidates[0]?.name ?? outcome.name ?? 'This card', candidates: outcome.candidates, matched: outcome.matched, chosen: null, artPreview: art, reason: outcome.reason,
          apply: (printing) => { setPicker(null); setSheet({ item: itemFor(outcome, printing, null, chosen.startFinish), likely: false, fromList: false }); },
        });
      }
      return;
    }
    // Stack mode: straight onto the list (a card it wasn't sure of gets the orange "check it" border, unless "best guess" is on)
    if (outcome.status === 'sure') {
      addToList(itemFor(outcome, outcome.printing!, null, chosen.startFinish));
      say(`Added ${outcome.printing!.name}${took}`);
    } else if (outcome.status === 'likely') {
      addToList(itemFor(outcome, outcome.printing!, guess ? null : 'pick', chosen.startFinish));
      say(guess ? `Added ${outcome.printing!.name} (best guess)${took}` : `${outcome.printing!.name}: please check the printing${took}`);
    } else {
      addToList(itemFor(outcome, outcome.candidates[0], guess ? null : 'pick', chosen.startFinish));
      say(guess ? `Added ${outcome.candidates[0].name} (best guess)${took}` : `${outcome.candidates[0].name}: pick the printing later${took}`);
    }
  }

  /* ----- choosing another printing of a card ----- */
  async function chooseAnother(item: ScanItem, update: (changed: ScanItem) => void, closeFirst?: () => void) {
    const all = item.candidates.length > 1 ? item.candidates : await printingsNamed(item.printing.name);
    closeFirst?.();
    setPicker({
      name: item.printing.name, candidates: all, matched: all === item.candidates ? item.matched : undefined, chosen: item.printing, artPreview: item.reading?.extras?.artPreview,
      apply: (printing) => {
        setPicker(null);
        update({ ...item, printing, flag: null, candidates: all, finish: finishesOf(printing).includes(item.finish) ? item.finish : startingFinish(printing) });
      },
    });
  }

  /* ----- adding to a binder ----- */
  function addNow(list: ScanItem[], after: () => void) { setAdding({ items: list, after }); }

  const bar = {
    left: (
      <View style={styles.modes}>
        {(['one', 'stack'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)}
                     style={[styles.chip, { borderColor: mode === m ? colors.accent : 'rgba(255,255,255,0.45)', backgroundColor: mode === m ? colors.accent : 'rgba(0,0,0,0.5)' }]}>
            <Text style={[styles.chipText, { color: mode === m ? colors.accentText : '#ffffff' }]}>{m === 'one' ? 'One card' : 'Stack'}</Text>
          </Pressable>
        ))}
      </View>
    ),
    right: (
      <View style={styles.rightBar}>
        {/* The gear: the scanner options. It's tinted orange, with the set's code beside it, while a set is locked. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={options.lockedSet ? `Scanner options, locked to ${options.lockedSet.name}` : 'Scanner options'}
          onPress={() => setSettingsOpen(true)}
          style={[styles.gear, { borderColor: options.lockedSet ? colors.accent : 'rgba(255,255,255,0.45)' }]}
        >
          <Ionicons name="settings-outline" size={20} color={options.lockedSet ? colors.accent : '#ffffff'} />
          {options.lockedSet && <Text style={[styles.lockCode, { color: colors.accent }]} numberOfLines={1}>{options.lockedSet.code.toUpperCase()}</Text>}
        </Pressable>
        {/* The list button with the number of cards (Stack mode), and "+2" while two scans are still being worked out */}
        {mode === 'stack' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Scanned list, ${items.reduce((sum, i) => sum + i.count, 0)} cards${pending > 0 ? `, ${pending} still being read` : ''}`}
            onPress={() => setListOpen(true)} style={[styles.count, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.countText, { color: colors.accentText }]}>{items.reduce((sum, i) => sum + i.count, 0)}{pending > 0 ? `+${pending}` : ''}</Text>
          </Pressable>
        )}
      </View>
    ),
  };

  return (
    <View style={styles.screen}>
      <ScannerCamera
        onReading={onReading} message={message} bar={bar} paused={!!sheet || !!picker || listOpen || !!adding || settingsOpen}
        queue={mode === 'stack'}
        looksLikeName={(text) => text.split('\n').some((line) => { const plain = normalizeName(line); return plain.length >= 3 && looksLikeAnyName(plain, names.current); })}
      />

      {settingsOpen && <ScanSettingsSheet options={options} onChange={changeScanOptions} onClose={() => setSettingsOpen(false)} />}

      {sheet && (
        <ConfirmSheet
          item={sheet.item}
          likely={sheet.likely}
          primaryLabel={sheet.fromList ? 'Done' : 'Add to binder'}
          onChange={(item) => setSheet({ ...sheet, item })}
          onPrimary={() => {
            if (sheet.fromList) { changeInList(sheet.item); setSheet(null); return; }
            addNow([sheet.item], () => setSheet(null));
          }}
          onWrongPrinting={() => chooseAnother(sheet.item, (item) => setSheet({ ...sheet, item, likely: false }))}
          onClose={() => setSheet(null)}
        />
      )}

      {listOpen && (
        <StackList
          items={items}
          onOpen={(item) => {
            if (item.flag) chooseAnother(item, changeInList);
            else setSheet({ item, likely: false, fromList: true });
          }}
          onRemove={(item) => setItems((list) => list.filter((other) => other.id !== item.id))}
          onAdd={() => addNow(items, () => { setItems([]); setListOpen(false); })}
          onClose={() => setListOpen(false)}
        />
      )}

      {picker && (
        <PrintingPicker
          name={picker.name} candidates={picker.candidates} matched={picker.matched} chosen={picker.chosen} artPreview={picker.artPreview} reason={picker.reason}
          onPick={picker.apply} onClose={() => setPicker(null)}
        />
      )}

      {adding && (
        <AddToBinderDialog
          items={adding.items}
          onDone={(note) => { adding.after(); setAdding(null); say(note); }}
          onCancel={() => setAdding(null)}
        />
      )}
    </View>
  );
}

// The look: the camera fills the screen; the mode choice and the count sit beside the scan button
const styles = StyleSheet.create({
  screen: { flex: 1 },
  modes: { gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, alignSelf: 'flex-start' },
  chipText: { fontSize: 13, fontWeight: '700' },
  rightBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gear: { minWidth: 36, height: 36, paddingHorizontal: 8, borderRadius: 18, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  lockCode: { fontSize: 12, fontWeight: '800', maxWidth: 52 },
  count: { minWidth: 36, height: 36, paddingHorizontal: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 15, fontWeight: '800' },
});
