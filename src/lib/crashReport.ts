/* =====================================================================
   READING THE LAST CRASH REPORT (Android only)
   The phone-side add-on (modules/card-text-reader, CrashReport.kt) watches for the app closing by itself
   and keeps what it can learn about it. This file asks for that text and builds the full details to copy:
   the add-on's report, the steps the scanner reached (the crash diary), and the sign-in diary.
   A build made before the add-on had this function simply has no "lastCrashReport", so every use here
   checks for it first and gives nothing instead of failing. Nothing here ever throws.
   ===================================================================== */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { reportId, savedId } from './crashReportCore';
import { storageGet, storageSet } from './storage';
import { previousTrailText, sessionText } from './scanner/crashTrail';

// What the add-on may offer (an older build offers neither)
type CrashAddOn = { lastCrashReport?: () => Promise<string>; clearCrashReport?: () => Promise<void> };

// The names the remembered ids are saved under
const SHOWN_KEY = 'crashReportShownId';
const CLEARED_KEY = 'crashReportClearedId';

// A report: its id, and the full text to copy
export type CrashReportInfo = { id: number; text: string };

// The add-on, or null (website, iPhone, or a build without it)
function addOn(): CrashAddOn | null {
  if (Platform.OS !== 'android') return null;
  try { return requireOptionalNativeModule<CrashAddOn>('CardTextReader'); } catch { return null; }
}

// The last crash report with everything worth sending, or null when there is nothing
export async function readCrashReport(): Promise<CrashReportInfo | null> {
  try {
    const mod = addOn();
    if (!mod || typeof mod.lastCrashReport !== 'function') return null;
    const native = await mod.lastCrashReport();
    const id = reportId(native);
    if (!id) return null;
    const parts = [native.trim(), await previousTrailText(), sessionText()].filter(Boolean);
    return { id, text: parts.join('\n\n') };
  } catch {
    return null;
  }
}

// The biggest report id already shown in the pop-up, and the biggest one cleared in Settings
export const shownId = (): number => savedId(storageGet(SHOWN_KEY));
export const clearedId = (): number => savedId(storageGet(CLEARED_KEY));
export function rememberShown(id: number): void { try { storageSet(SHOWN_KEY, String(id)); } catch { /* shown again next time then */ } }

// Clear a report from Settings: remember it as cleared and delete the add-on's saved file
export async function clearCrashReport(id: number): Promise<void> {
  try { storageSet(CLEARED_KEY, String(id)); } catch { /* it stays listed then */ }
  try {
    const mod = addOn();
    if (mod && typeof mod.clearCrashReport === 'function') await mod.clearCrashReport();
  } catch { /* the file may stay; the remembered id hides it anyway */ }
}
