/* =====================================================================
   LOCKING A SCAN TO ONE SET (shared, plain TypeScript, no imports)
   When the scanner has read a card's name, it looks at every printing of
   that card. If the person has locked the scanner to a set, only that set's
   printings are worth considering, and that usually leaves one (or a few
   that look the same).
   Two things can go differently from "just filter":
   - the card has NO printing in the locked set (a wrong lock, or the name was
     misread): then nothing is thrown away. All the printings are kept and the
     answer says so ("missing"), so the scanner never returns "sure" for it.
   - there is no lock: nothing changes.
   ===================================================================== */

export type SetLockResult<T> = {
  printings: T[];       // the printings to go on with
  locked: boolean;      // the lock was applied (only the locked set's printings remain)
  missing: boolean;     // there is a lock, but this card has no printing in that set
};

export function applySetLock<T extends { setCode: string }>(printings: T[], lockedCode: string | null | undefined): SetLockResult<T> {
  const code = (lockedCode ?? '').trim().toLowerCase();
  if (!code) return { printings, locked: false, missing: false };
  const inSet = printings.filter((p) => p.setCode.toLowerCase() === code);
  if (inSet.length === 0) return { printings, locked: false, missing: printings.length > 0 };
  return { printings: inSet, locked: true, missing: false };
}
