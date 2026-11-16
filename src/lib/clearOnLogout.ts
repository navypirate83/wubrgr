/* =====================================================================
   CLEARING THIS DEVICE WHEN LOGGING OUT
   Logging out by hand (the account menu's "Log out", Settings → Account's
   "Log out" and "Log out everywhere") leaves your binders, lists and decks
   saved on the device, as it always has. These two steps let the person
   choose to clear them as well:
     - askToClearDevice: asks "Clear what's saved on this device too?" It
       says whether the account has everything first: if the latest changes
       haven't reached the account yet, clearing would lose them, so the
       question says so.
     - clearDeviceData: does it, the same as Settings → "Reset device
       memory" (see resetPhoneMemory in driveSync.ts): every binder, list
       and deck on this device, the Google Drive connection and the saved
       card information go. The account (and Google Drive's files) are not
       touched, and your settings stay.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { askYesNo } from './dialogs';
import { changedSinceSync } from './serverSync';
import { resetPhoneMemory } from './driveSync';

// Ask whether to clear this device too (true: clear it). Call it after the
// last changes have been sent to the account (or the sending has failed).
export async function askToClearDevice(): Promise<boolean> {
  const unsent = changedSinceSync();
  const warning = unsent
    ? '\n\nCareful: your latest changes have NOT reached your account yet (no internet, or the account couldn\'t be reached). Clearing now would lose them.'
    : '\n\nEverything is already saved in your account.';
  return askYesNo(
    'Clear what\'s saved on this device?',
    `This removes your binders, lists and decks from this device. They come back from your account when you log in again. Your settings stay.${warning}`,
    'Clear this device',
    'Keep it',
  );
}

// Clear this device's saved binders, lists and decks (see the top of the file)
export async function clearDeviceData(): Promise<void> {
  await resetPhoneMemory();
}
