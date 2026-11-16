/* =====================================================================
   TEXT HELPERS FOR THE SCANNER (shared, plain TypeScript, no imports)
   normalizeName turns a card name into a plain form for matching: no
   accents, lowercase, letters and digits only with single spaces. The
   catalogue stores each card's name in this form ("name_norm") and the
   scanner turns what it read into the same form before comparing, so
   "Lim-Dûl's Vault" and "lim dul s vault" meet. The catalogue build script
   uses this same file.
   ===================================================================== */

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
