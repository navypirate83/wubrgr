/* =====================================================================
   "THE APP CLOSED UNEXPECTEDLY" POP-UP (Android only; draws nothing itself)
   Mounted once, high up in the app (see app/_layout.tsx). A moment after the app starts it asks the
   phone-side add-on whether the app's last run ended in a crash (lib/crashReport.ts). If there is a report
   that has not been shown yet, the app's own pop-up asks whether to copy the details (to send to the developer).
   Each report is shown only once. It never blocks the app starting, and nothing in it can throw.
   The same details are always in Settings -> About ("Last crash report").
   ===================================================================== */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { askYesNo } from '@/lib/dialogs';
import { clearedId, readCrashReport, rememberShown, shownId } from '@/lib/crashReport';
import { shouldPopUp } from '@/lib/crashReportCore';

// How long to wait after the app starts before looking, so the first screen is drawn first (milliseconds)
const LOOK_DELAY_MS = 1500;

export default function CrashReportHost() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const report = await readCrashReport();
          if (!alive || !report || !shouldPopUp(report.id, shownId(), clearedId())) return;
          // Remembered BEFORE asking, so the pop-up can never come back for the same report
          rememberShown(report.id);
          const copy = await askYesNo(
            'The app closed unexpectedly last time',
            'Copy the details to send to the developer?',
            'Copy details', 'Dismiss',
          );
          if (copy) await Clipboard.setStringAsync(report.text);
        } catch {
          /* this is only a help: never a problem */
        }
      })();
    }, LOOK_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  return null;
}
