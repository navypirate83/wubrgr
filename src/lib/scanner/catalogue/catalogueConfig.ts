/* =====================================================================
   WHERE THE CATALOGUE IS DOWNLOADED FROM
   The scanner's card catalogue (see scripts/catalogue/build-catalogue.mjs) is
   a file the app downloads once and keeps on the device. It's found at
   this address plus "/catalogue.json" (what's the newest one) and
   "/catalogue.db.gz" (the database, gzipped). Set it with the
   EXPO_PUBLIC_CATALOGUE_URL setting when the app is built or run; with
   nothing set, the scanner says there's nowhere to download from.
   (Settings → Card catalogue is where it's downloaded.
   To try a catalogue you built yourself, run scripts/catalogue/serve.mjs
   and use http://localhost:4200.)
   ===================================================================== */

export const CATALOGUE_URL = (process.env.EXPO_PUBLIC_CATALOGUE_URL ?? '').replace(/\/+$/, '');

// How old the catalogue may get before the scanner suggests a refresh (days)
export const REFRESH_AFTER_DAYS = 7;
