/* =====================================================================
   THE SCANNER'S OPTIONS (shared, plain TypeScript, no imports)
   The choices behind the little gear button on the scan screen. They are
   all optional: with none of them touched, the scanner behaves as it
   always has.
   - lockedSet: "everything I'm scanning is from this set". Off by default.
     When it's on, a card the scanner has to work out from its name is only
     compared against that set's printings, which makes the answer much
     quicker and surer. A card that has no printing in that set is still
     found (from all its printings), just never added without you checking.
   - unsure: what to do when a card could be several printings. "ask"
     (the usual way) shows the printing picker, or marks the card in the
     stack list for you to check. "guess" takes the scanner's best guess
     and carries on; you can still change a card in the list afterwards.
   - startFinish: which finish a scanned card starts with, "nonfoil" or
     "foil" (a card that doesn't come in foil is still non-foil).
   - showTimings: show how long each scan took, after the scan.
   - aiArt: "AI art matching" (website only for now): also compare the photo's
     artwork with the saved artworks using an AI model, which needs extra files
     downloaded once (see ai/). On by default (only for accounts with AI scanner access); with it off, or with the files
     missing, the scanner works exactly as before.
   The options are saved on the device (see ../scanSettings.ts). Anything
   saved that isn't one of these values is ignored and the usual choice is
   used instead.
   ===================================================================== */

// The set a scan is locked to: its code (lowercase, like "dom") and its name, for showing
export type LockedSet = { code: string; name: string };

export type UnsureAction = 'ask' | 'guess';
export type StartFinish = 'nonfoil' | 'foil';

export type ScanOptions = {
  lockedSet: LockedSet | null;
  unsure: UnsureAction;
  startFinish: StartFinish;
  showTimings: boolean;
  aiArt: boolean;
};

// What every option is until it's changed
export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  lockedSet: null,
  unsure: 'ask',
  startFinish: 'nonfoil',
  showTimings: true,
  aiArt: true,
};

// Turn whatever was saved (anything at all, even junk) into a proper set of options,
// keeping each good value and using the usual choice for the rest
export function cleanScanOptions(raw: unknown): ScanOptions {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lock = saved.lockedSet as Record<string, unknown> | null | undefined;
  const code = lock && typeof lock.code === 'string' ? lock.code.trim().toLowerCase() : '';
  return {
    lockedSet: code ? { code, name: typeof lock!.name === 'string' && lock!.name ? lock!.name : code.toUpperCase() } : null,
    unsure: saved.unsure === 'guess' ? 'guess' : 'ask',
    startFinish: saved.startFinish === 'foil' ? 'foil' : 'nonfoil',
    showTimings: typeof saved.showTimings === 'boolean' ? saved.showTimings : DEFAULT_SCAN_OPTIONS.showTimings,
    aiArt: typeof saved.aiArt === 'boolean' ? saved.aiArt : DEFAULT_SCAN_OPTIONS.aiArt,
  };
}
