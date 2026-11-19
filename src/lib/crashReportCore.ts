/* =====================================================================
   THE PLAIN SUMS BEHIND "THE APP CLOSED UNEXPECTEDLY" REPORTS (no imports, with tests)
   The phone-side add-on gives a report as text whose first line is "id=<number>" (the time of the
   newest serious event). The app remembers the biggest id it has already shown in a pop-up, and the
   biggest id the person cleared from Settings, so each report pops up only once and a cleared
   one leaves the Settings list. This file only holds those small decisions.
   ===================================================================== */

// The id at the top of a report (0 when there is none, or the text is not a report)
export function reportId(text: string | null | undefined): number {
  if (!text) return 0;
  const match = /^id=(\d+)/.exec(text);
  const id = match ? Number(match[1]) : 0;
  return Number.isFinite(id) ? id : 0;
}

// A remembered id read back from saved text (0 when nothing is saved or it is damaged)
export function savedId(text: string | null | undefined): number {
  const id = Number(text);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

// Should the pop-up appear for this report? Only when it is a real report, newer than the one shown before, and not cleared.
export function shouldPopUp(id: number, shownId: number, clearedId: number): boolean {
  return id > 0 && id > shownId && id > clearedId;
}

// Should Settings list this report? Whenever there is one that has not been cleared.
export function shouldList(id: number, clearedId: number): boolean {
  return id > 0 && id > clearedId;
}
