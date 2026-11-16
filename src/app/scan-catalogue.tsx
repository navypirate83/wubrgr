/* =====================================================================
   THE CARD CATALOGUE PAGE (/scan-catalogue)
   A plain working page for the scanner's catalogue: a small database of
   every paper printing, with its art fingerprint and set symbol, kept on the
   device so scanning works with no internet. It shows what's on this device,
   checks for a newer one, downloads or removes it, and lets you try the
   lookups the scanner will use (by set code and collector number, and by the
   start of a card's name). The scanner's own screens come later; this one is
   for checking that the catalogue loads and answers on Android and on the web.
   Reached from Settings → Card scanner catalogue.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import { useColors } from '@/hooks/useTheme';
import { MAX_CONTENT_WIDTH, SPACE } from '@/theme/colors';
import type { CatalogueInfo, Printing, RemoteCatalogue } from '@/lib/scanner/core/catalogueTypes';
import {
  artHashFor, catalogueConfigured, checkRemote, downloadCatalogue, findPrintings, isNewer, isStale,
  openCatalogue, removeCatalogue, searchNames, setSymbol, type DownloadStage,
} from '@/lib/scanner/catalogue/catalogue';
import { CATALOGUE_URL } from '@/lib/scanner/catalogue/catalogueConfig';

const STAGE_WORDS: Record<DownloadStage, string> = { downloading: 'Downloading', unpacking: 'Unpacking', saving: 'Saving' };

// A size in bytes as words
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function ScanCataloguePage() {
  const colors = useColors();
  // What's on this device (undefined: still looking; null: nothing yet)
  const [info, setInfo] = useState<CatalogueInfo | null | undefined>(undefined);
  const [remote, setRemote] = useState<RemoteCatalogue | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const look = useCallback(async () => {
    try {
      setInfo(await openCatalogue());
    } catch (err) {
      setInfo(null);
      setMessage((err as Error).message);
    }
  }, []);
  useEffect(() => { look(); }, [look]);

  async function check() {
    setMessage('Checking…');
    const found = await checkRemote();
    setRemote(found);
    setMessage(!catalogueConfigured() ? 'No download address is set (EXPO_PUBLIC_CATALOGUE_URL).' : !found ? 'Could not reach the download address (offline?).' : isNewer(found, info ?? null) ? 'A newer catalogue is available.' : 'You have the newest catalogue.');
  }

  async function download() {
    setBusy(true);
    try {
      const done = await downloadCatalogue((stage, fraction) => setMessage(`${STAGE_WORDS[stage]}${fraction !== null ? ` ${Math.round(fraction * 100)}%` : '…'}`));
      setInfo(done);
      setMessage('The catalogue is on this device.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await removeCatalogue();
    setInfo(null);
    setMessage('Removed from this device.');
  }

  /* ----- trying the lookups ----- */
  const [setCode, setSetCode] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [found, setFound] = useState<Printing[]>([]);
  const [detail, setDetail] = useState('');

  async function lookup(run: () => Promise<Printing[]>) {
    try {
      const printings = await run();
      setFound(printings);
      const first = printings[0];
      if (!first) { setDetail('Nothing found.'); return; }
      const symbol = await setSymbol(first.setCode);
      const art = first.illus ? await artHashFor(first.illus) : null;
      setDetail(`First result: set symbol ${symbol ? `${symbol.length} bytes` : 'none'}, art fingerprint ${art ? 'present' : first.illus ? 'not made yet' : 'none'}.`);
    } catch (err) {
      setFound([]);
      setDetail((err as Error).message);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.title, { color: colors.text }]}>Card catalogue</Text>
      <Text style={[styles.text, { color: colors.muted }]}>
        The scanner identifies a card from a database kept on this device, so it works with no internet once it has been downloaded.
      </Text>

      <View style={[styles.box, { borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>On this device</Text>
        {info === undefined ? <Text style={[styles.text, { color: colors.muted }]}>Looking…</Text>
          : info === null ? <Text style={[styles.text, { color: colors.muted }]}>No catalogue yet.</Text>
          : (
            <Text style={[styles.text, { color: colors.text }]}>
              {info.printings.toLocaleString()} printings, {info.sets.toLocaleString()} sets, {info.artworks.toLocaleString()} art fingerprints.{'\n'}
              Built {info.builtAt.slice(0, 10)} from Scryfall's {info.sourceUpdatedAt.slice(0, 10)} data{isStale(info) ? ' (a week or more old: time to refresh)' : ''}.
            </Text>
          )}
        {remote && <Text style={[styles.text, { color: colors.muted }]}>Newest available: built {remote.builtAt.slice(0, 10)}, download {megabytes(remote.gzipBytes)}.</Text>}
        {CATALOGUE_URL === '' && <Text style={[styles.text, { color: colors.error }]}>No download address is set.</Text>}
        {message !== '' && <Text style={[styles.text, { color: colors.text }]}>{message}</Text>}
        <View style={styles.buttons}>
          <Button label="Check for a newer one" kind="secondary" icon="refresh-outline" onPress={check} disabled={busy} />
          <Button label={info ? 'Update' : 'Download'} icon="download-outline" onPress={download} disabled={busy || !catalogueConfigured()} />
          {info ? <Button label="Remove" kind="secondary" icon="trash-outline" onPress={remove} disabled={busy} /> : null}
        </View>
      </View>

      <View style={[styles.box, { borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Try a lookup</Text>
        <View style={styles.row}>
          <View style={styles.small}><TextField label="Set code" value={setCode} onChangeText={setSetCode} autoCapitalize="none" autoCorrect={false} placeholder="dom" /></View>
          <View style={styles.small}><TextField label="Number" value={number} onChangeText={setNumber} autoCapitalize="none" autoCorrect={false} placeholder="123" /></View>
        </View>
        <Button label="Find by set and number" kind="secondary" onPress={() => lookup(() => findPrintings(setCode.trim(), number.trim()))} disabled={!info} />
        <TextField label="Name starts with" value={name} onChangeText={setName} autoCapitalize="none" autoCorrect={false} placeholder="lightning b" />
        <Button label="Find by name" kind="secondary" onPress={() => lookup(() => searchNames(name))} disabled={!info} />
        {detail !== '' && <Text style={[styles.text, { color: colors.muted }]}>{detail}</Text>}
        {found.map((p) => (
          <View key={p.id} style={[styles.result, { borderColor: colors.border }]}>
            {p.image ? <Image source={{ uri: p.image }} style={styles.picture} contentFit="cover" /> : <View style={styles.picture} />}
            <View style={styles.resultText}>
              <Text style={[styles.name, { color: colors.text }]}>{p.name}</Text>
              <Text style={[styles.text, { color: colors.muted }]}>
                {p.setName} ({p.setCode.toUpperCase()}) #{p.collectorNumber} · {p.lang.toUpperCase()} · {p.year}{'\n'}
                {p.border} border, {p.frame} frame · {p.finishes.join(', ') || 'no finishes listed'}{'\n'}
                {p.rarity} · {p.typeLine} · {p.colors || 'colourless'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// The look: one column, never wider than the app's page width, with a box for each part
const styles = StyleSheet.create({
  page: { padding: SPACE.l, gap: SPACE.m, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800' },
  heading: { fontSize: 16, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 20 },
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: SPACE.m, gap: SPACE.s },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  row: { flexDirection: 'row', gap: SPACE.s },
  small: { flex: 1 },
  result: { flexDirection: 'row', gap: SPACE.m, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE.s },
  picture: { width: 63, height: 88, borderRadius: 4 },
  resultText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
});
