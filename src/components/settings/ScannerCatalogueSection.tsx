/* =====================================================================
   SETTINGS → CARD CATALOGUE
   The card scanner identifies a card from a catalogue (a database of every
   printing, from Scryfall) kept on this device, so it works with no internet.
   This section shows what's on the device (how many printings, sets and
   art fingerprints, and how old it is) and:
     - "Check for a newer one" asks the download address if there's a newer
       catalogue
     - "Download" or "Update" gets the newest one (with its progress)
     - "Remove" deletes it from this device
   On the phone app, downloading asks first, since the file is large.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import { useColors } from '@/hooks/useTheme';
import { askYesNo } from '@/lib/dialogs';
import { SPACE } from '@/theme/colors';
import type { CatalogueInfo, RemoteCatalogue } from '@/lib/scanner/core/catalogueTypes';
import {
  catalogueConfigured, checkRemote, downloadCatalogue, isNewer, isStale, openCatalogue, removeCatalogue, type DownloadStage,
} from '@/lib/scanner/catalogue/catalogue';
import { SettingRow, SettingsSection } from './SettingsParts';

const STAGE_WORDS: Record<DownloadStage, string> = { downloading: 'Downloading', unpacking: 'Unpacking', saving: 'Saving' };

// A size in bytes as words
const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export default function ScannerCatalogueSection() {
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
    setMessage(!catalogueConfigured() ? 'There is no download address for the catalogue yet.'
      : !found ? 'The catalogue could not be reached (are you offline?).'
      : isNewer(found, info ?? null) ? 'A newer catalogue is available.'
      : 'You have the newest catalogue.');
  }

  async function download() {
    // The phone app asks first: the file is big (the website just does it)
    if (Platform.OS !== 'web') {
      const size = remote ? ` (${megabytes(remote.gzipBytes)})` : '';
      const sure = await askYesNo(
        'Download the card catalogue?',
        `The scanner needs a list of every card to tell which one you're holding. It's a large download${size}, so Wi-Fi is wise. Once it's on this phone, scanning works with no internet.`,
        'Download', 'Not now',
      );
      if (!sure) return;
    }
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
    const sure = await askYesNo('Remove the catalogue?', 'The scanner can\'t identify cards until it is downloaded again.', 'Remove', 'Keep it');
    if (!sure) return;
    await removeCatalogue();
    setInfo(null);
    setMessage('Removed from this device.');
  }

  const onDevice = info === undefined ? 'Looking…'
    : info === null ? 'There is no catalogue on this device yet.'
    : `${info.printings.toLocaleString()} printings, ${info.sets.toLocaleString()} sets and ${info.artworks.toLocaleString()} art fingerprints, built ${info.builtAt.slice(0, 10)} from Scryfall's ${info.sourceUpdatedAt.slice(0, 10)} data${isStale(info) ? ' (a week or more old: time to refresh)' : ''}.`;

  return (
    <SettingsSection title="Card catalogue">
      <SettingRow
        name="Scanner catalogue"
        description={`The card scanner identifies a card from this list of every printing, kept on the device so it works with no internet. ${onDevice}`}
      />
      {(message !== '' || remote) && (
        <View style={styles.status}>
          {remote && <Text style={[styles.text, { color: colors.muted }]}>Newest available: built {remote.builtAt.slice(0, 10)}, a {megabytes(remote.gzipBytes)} download.</Text>}
          {message !== '' && <Text style={[styles.text, { color: colors.text }]}>{message}</Text>}
        </View>
      )}
      <View style={styles.buttons}>
        <Button label="Check for a newer one" kind="secondary" icon="refresh-outline" onPress={check} disabled={busy} />
        <Button label={info ? 'Update' : 'Download'} kind="secondary" icon="download-outline" onPress={download} disabled={busy || !catalogueConfigured()} />
        {info ? <Button label="Remove" kind="secondary" icon="trash-outline" onPress={remove} disabled={busy} /> : null}
      </View>
    </SettingsSection>
  );
}

// The look: the buttons with room around them, and the status lines above them
const styles = StyleSheet.create({
  status: { paddingHorizontal: SPACE.l, gap: 2 },
  text: { fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.m, padding: SPACE.m },
});
