/* =====================================================================
   WHERE THE CATALOGUE IS DOWNLOADED FROM
   The scanner's card catalogue (see scripts/catalogue/build-catalogue.mjs) is
   a file the app downloads once and keeps on the device. It's found at
   this address plus "/catalogue.json" (what's the newest one) and
   "/catalogue.db.gz" (the database, gzipped). Unless EXPO_PUBLIC_CATALOGUE_URL
   says otherwise when the app is built or run, it's the website's own "catalogue"
   folder: the site's publish step copies the files there from the repository's
   "catalogue" release (see .github/workflows/deploy.yml). GitHub Pages lets any
   page and the phone app download from it.
   (Settings → Card catalogue is where it's downloaded.
   To try a catalogue you built yourself, run scripts/catalogue/serve.mjs
   and use http://localhost:4200.)
   ===================================================================== */

import { SITE_URL } from '@/lib/site';

export const CATALOGUE_URL = (process.env.EXPO_PUBLIC_CATALOGUE_URL ?? `${SITE_URL}catalogue`).replace(/\/+$/, '');

// How old the catalogue may get before the scanner suggests a refresh (days)
export const REFRESH_AFTER_DAYS = 7;
