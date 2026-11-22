/* =====================================================================
   WHERE THE WEBSITE LIVES
   The web address of the WUBRG'r website, written ONCE here so every
   place that shows or links to it (Settings → About, Help, shared Card
   Finder links) stays the same. If the website ever moves, change this
   line. (The site has an address of its own, wubrgr.navypirate83.com, so
   that no other project shares it: a browser treats everything at one
   address as one site, and the server only trusts this one. It used to be
   navypirate83.com/wubrgr, which now forwards here.)
   Plain TypeScript with no React in it.
   ===================================================================== */

// The full address, with https:// and a / on the end
export const SITE_URL = 'https://wubrgr.navypirate83.com/';

// The same without https:// and without the / on the end, for showing
// to people ("wubrgr.navypirate83.com")
export const SITE_NAME = SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '');
