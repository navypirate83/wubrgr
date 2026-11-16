/* =====================================================================
   THE SCAN SCREEN (shared by Android and the website)
   The camera (ScannerCamera.web.tsx or ScannerCamera.native.tsx, picked when
   the app is built) hands over the raw text it read from a card. This screen
   makes sense of it, the same way on both platforms:
     - parses the info line (core/infoLine.ts) into collector number, set code
       and language, and checks the set code against the real sets
     - looks the set and number up in the catalogue
     - reads the title-bar name against the catalogue's card names (fuzzy), to
       see whether the name agrees
     - says how sure it is (core/decide.ts)
   FOR NOW (the website's first stage) it shows all of that as plain text under
   the camera, so the reading can be checked; the confirm screen, the printing
   picker and the "add to binder" step come next.
   The first time, with no catalogue on the device, it asks before downloading.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import ScannerCamera from './ScannerCamera';
import Button from '@/components/Button';
import { useColors } from '@/hooks/useTheme';
import { askYesNo } from '@/lib/dialogs';
import { SPACE } from '@/theme/colors';
import { decideScan, type ScanVerdict } from '@/lib/scanner/core/decide';
import { bestNameMatch, similarity, type NameMatch } from '@/lib/scanner/core/fuzzy';
import { parseCopyrightYears, parseInfoLine, type InfoLine } from '@/lib/scanner/core/infoLine';
import { checkSetCode, type CheckedSetCode } from '@/lib/scanner/core/setCode';
import type { ScanReading } from '@/lib/scanner/core/scannerTypes';
import type { CatalogueInfo, Printing } from '@/lib/scanner/core/catalogueTypes';
import { normalizeName } from '@/lib/scanner/core/text';
import {
  allFrontNames, catalogueConfigured, downloadCatalogue, findPrintings, openCatalogue, setCodes, type DownloadStage,
} from '@/lib/scanner/catalogue/catalogue';

// What was made of one reading
type Result = {
  reading: ScanReading;
  info: InfoLine;
  years: { from: number; to: number } | null;
  checked: CheckedSetCode | null;
  found: Printing[];
  name: NameMatch | null;
  nameAgrees: boolean | null;
  verdict: ScanVerdict;
};

const STAGE_WORDS: Record<DownloadStage, string> = { downloading: 'Downloading', unpacking: 'Unpacking', saving: 'Saving' };

export default function ScanScreen() {
  const colors = useColors();
  // The catalogue on this device (undefined: still looking; null: none)
  const [catalogue, setCatalogue] = useState<CatalogueInfo | null | undefined>(undefined);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  /* ----- the catalogue: opened, or offered for download the first time ----- */
  const getCatalogue = useCallback(async () => {
    try {
      const info = await openCatalogue();
      setCatalogue(info);
      return info;
    } catch (err) {
      setProgress((err as Error).message);
      setCatalogue(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (await getCatalogue() || !catalogueConfigured()) return;
      const yes = await askYesNo(
        'Get the card catalogue?',
        'The scanner needs a list of every card to tell which one you\'re holding. It is a large download, and once it\'s on this device scanning works with no internet.',
        'Download', 'Not now',
      );
      if (!yes) return;
      try {
        setCatalogue(await downloadCatalogue((stage, fraction) => setProgress(`${STAGE_WORDS[stage]}${fraction !== null ? ` ${Math.round(fraction * 100)}%` : '…'}`)));
        setProgress('');
      } catch (err) {
        setProgress((err as Error).message);
      }
    })();
  }, [getCatalogue]);

  /* ----- making sense of a reading ----- */
  async function understand(reading: ScanReading) {
    const info = parseInfoLine(reading.infoText);
    const years = parseCopyrightYears(reading.bottomText);
    let checked: CheckedSetCode | null = null;
    let found: Printing[] = [];
    let name: NameMatch | null = null;
    if (catalogue) {
      checked = checkSetCode(info.setCode, new Set(await setCodes()));
      if (checked && info.collectorNumber) found = await findPrintings(checked.code, info.collectorNumber, info.lang ?? undefined);
      const read = normalizeName(reading.nameText);
      if (read) name = bestNameMatch(read, await allFrontNames());
    }
    // Does the name agree with the printing the set and number found? (null: no name was read)
    const readName = normalizeName(reading.nameText);
    const nameAgrees = !readName ? null
      : found.length === 1 ? similarity(readName, normalizeName(found[0].name.split(' // ')[0])) >= 0.75
      : name ? true : false;
    const verdict = decideScan({ info, setCode: checked, matches: found.length, nameAgrees, requireName: true });
    setResult({ reading, info, years, checked, found, name, nameAgrees, verdict });
  }

  const line = (label: string, value: string) => (
    <Text style={[styles.text, { color: colors.text }]}><Text style={{ color: colors.muted }}>{label}: </Text>{value || '(nothing)'}</Text>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.camera}>
        <ScannerCamera onReading={understand} />
      </View>

      <ScrollView style={styles.results} contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>
        {catalogue === null && (
          <Text style={[styles.text, { color: colors.error }]}>
            {progress || (catalogueConfigured() ? 'There is no catalogue on this device yet.' : 'There is no download address for the card catalogue yet.')}
          </Text>
        )}
        {catalogue === null && catalogueConfigured() && <Button label="Download the catalogue" kind="secondary" icon="download-outline" onPress={() => { setProgress(''); getCatalogue(); }} />}
        {progress !== '' && catalogue !== null && <Text style={[styles.text, { color: colors.muted }]}>{progress}</Text>}

        {result ? (
          <>
            <Text style={[styles.heading, { color: result.verdict.status === 'sure' ? colors.success : result.verdict.status === 'none' ? colors.error : colors.accent }]}>
              {result.verdict.status.toUpperCase()}: {result.verdict.reason}
            </Text>
            {line('Info line (raw)', result.reading.infoText)}
            {line('Name (raw)', result.reading.nameText)}
            {line('Bottom line (raw)', result.reading.bottomText)}
            <Text style={[styles.heading, { color: colors.text }]}>Parsed</Text>
            {line('Collector number', result.info.collectorNumber ?? '')}
            {line('Set code', result.info.setCode ? `${result.info.setCode}${result.checked ? (result.checked.corrected ? ` (corrected to ${result.checked.code})` : ' (a real set)') : ' (not a real set)'}` : '')}
            {line('Language', result.info.lang ?? '')}
            {line('Rarity / layout', `${result.info.rarity ?? ''} ${result.info.layout ?? ''}`.trim())}
            {line('Copyright year', result.years ? `${result.years.from}${result.years.to !== result.years.from ? `-${result.years.to}` : ''}` : '')}
            <Text style={[styles.heading, { color: colors.text }]}>Catalogue</Text>
            {line('Name closest to', result.name ? `${result.name.name} (${Math.round(result.name.similarity * 100)}%${result.name.clear ? '' : ', not clear'})` : '')}
            {line('Name agrees with set and number', result.nameAgrees === null ? 'no name read' : result.nameAgrees ? 'yes' : 'no')}
            {result.found.map((p) => (
              <View key={p.id} style={styles.found}>
                {p.image ? <Image source={{ uri: p.image }} style={styles.picture} contentFit="cover" /> : null}
                <Text style={[styles.text, { color: colors.text, flex: 1 }]}>
                  {p.name}{'\n'}{p.setName} ({p.setCode.toUpperCase()}) #{p.collectorNumber} · {p.lang.toUpperCase()} · {p.finishes.join(', ')}
                </Text>
              </View>
            ))}
            <Text style={[styles.heading, { color: colors.text }]}>What it read (as the reader saw it)</Text>
            <View style={styles.crops}>
              {(['info', 'name', 'bottom'] as const).map((k) => (result.reading.debug?.[k] ? <Image key={k} source={{ uri: result.reading.debug[k] }} style={styles.crop} contentFit="contain" /> : null))}
            </View>
          </>
        ) : (
          <Text style={[styles.text, { color: colors.muted }]}>Scan a card to see what was read.</Text>
        )}
      </ScrollView>
    </View>
  );
}

// The look: the camera on top and the reading's details scrolling underneath it
const styles = StyleSheet.create({
  screen: { flex: 1 },
  camera: { flex: 3, minHeight: 360 },
  results: { flex: 2, minHeight: 160 },
  resultsContent: { padding: SPACE.m, gap: 4 },
  heading: { fontSize: 15, fontWeight: '800', marginTop: SPACE.s },
  text: { fontSize: 14, lineHeight: 20 },
  found: { flexDirection: 'row', gap: SPACE.s, alignItems: 'center', marginTop: SPACE.xs },
  picture: { width: 50, height: 70, borderRadius: 4 },
  crops: { gap: SPACE.xs },
  crop: { width: '100%', height: 70, backgroundColor: '#fff' },
});
