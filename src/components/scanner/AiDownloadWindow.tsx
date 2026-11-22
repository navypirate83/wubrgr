/* =====================================================================
   THE "DOWNLOADING THE AI SCANNER" WINDOW
   A pop-up that downloads the AI files (about 42 MB) and shows how far
   along it is with a progress bar and a percentage. It starts the
   download itself as soon as it opens.
   - While downloading: the bar, the percentage, and a note to keep the
     app open. There is no button and tapping outside does nothing, so
     the download can't be closed by accident.
   - If it fails: what went wrong, with "Try again" and "Close".
   - When it's done: "The AI scanner is ready." and a "Done" button.
   "onClose" is told whether the files are now on the device.
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import PopupWindow from '@/components/PopupWindow';
import ProgressBar from '@/components/ProgressBar';
import { useColors } from '@/hooks/useTheme';
import { downloadAiFiles } from '@/lib/scanner/ai/aiFiles';
import { forgetAiIndex } from '@/lib/scanner/ai/aiRun';

export default function AiDownloadWindow({ onClose }: { onClose: (downloaded: boolean) => void }) {
  const colors = useColors();
  // How far along the download is (0 to 1)
  const [fraction, setFraction] = useState(0);
  // Where things stand: still downloading, finished, or stopped with a problem
  const [stage, setStage] = useState<'downloading' | 'done' | 'failed'>('downloading');
  const [problem, setProblem] = useState('');
  // Whether this window is still on the screen (a download that finishes after it closed must not touch it)
  const here = useRef(true);
  useEffect(() => () => { here.current = false; }, []);

  // Download the files, moving the bar as the bytes arrive
  const start = useCallback(async () => {
    setStage('downloading');
    setProblem('');
    setFraction(0);
    try {
      await downloadAiFiles((now) => { if (here.current) setFraction(now); });
      // The scanner re-reads the new files the next time the AI is used
      forgetAiIndex();
      if (here.current) { setFraction(1); setStage('done'); }
    } catch (err) {
      if (here.current) { setProblem((err as Error).message); setStage('failed'); }
    }
  }, []);
  // Start as soon as the window opens
  useEffect(() => { void start(); }, [start]);

  const percent = Math.round(fraction * 100);
  return (
    <PopupWindow
      title={stage === 'done' ? 'The AI scanner is ready' : stage === 'failed' ? 'The download stopped' : 'Downloading the AI scanner'}
      // Tapping outside (or Back) only closes it once the download is over
      onClose={() => { if (stage !== 'downloading') onClose(stage === 'done'); }}
      buttons={stage === 'done' ? [{ label: 'Done', onPress: () => onClose(true) }]
        : stage === 'failed' ? [
          { label: 'Close', kind: 'secondary', onPress: () => onClose(false) },
          { label: 'Try again', onPress: () => { void start(); } },
        ]
        : []}
    >
      <View style={styles.body}>
        <ProgressBar fraction={fraction} label="AI scanner download" />
        {/* The percentage, read out by screen readers as it changes */}
        <Text style={[styles.percent, { color: colors.text }]} accessibilityLiveRegion="polite">{percent}%</Text>
        {stage === 'downloading' && (
          <Text style={[styles.note, { color: colors.muted }]}>About 42 MB. Keep the app open until it finishes.</Text>
        )}
        {stage === 'done' && (
          <Text style={[styles.note, { color: colors.muted }]}>It is saved on this device. You can delete it later from the scanner options (the gear button).</Text>
        )}
        {stage === 'failed' && (
          <Text style={[styles.note, { color: colors.error }]}>{problem}</Text>
        )}
      </View>
    </PopupWindow>
  );
}

// The look: the bar, the percentage under it in the middle, then one line of words
const styles = StyleSheet.create({
  body: { gap: 10 },
  percent: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  note: { fontSize: 14, lineHeight: 20 },
});
