/* =====================================================================
   DECK IMPORT FROM A LINK (/import/deck)
   The app can fill a deck from a link to a deck on Archidekt or Moxfield.
   A browser isn't allowed to ask those sites directly (they only answer
   their own pages), so the app asks THIS server, which asks them and sends
   the deck back as the site gave it. The app then reads it.
   - GET /import/deck?url=https://archidekt.com/decks/123456/some-name
   - GET /import/deck?url=https://moxfield.com/decks/AbCdEf12345
   Answers: { source: 'archidekt' | 'moxfield', data: <the site's deck> }
   Only these two sites, only deck addresses, only https: nothing else can
   be asked for (so this can't be used to reach other places).
   Moxfield blocks many automated requests; when it does, the answer says so
   plainly and the app tells the person to paste Moxfield's text export.
   Mounted behind requireAuth in app.js.
   ===================================================================== */

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

// Work out which site and which deck a link is for (null: not a deck link we know)
export function readDeckLink(link) {
  let url;
  try { url = new URL(String(link).trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'decks' || !parts[1]) return null;
  if (host === 'archidekt.com' && /^\d{1,12}$/.test(parts[1])) {
    return { source: 'archidekt', id: parts[1], api: `https://archidekt.com/api/decks/${parts[1]}/` };
  }
  if (host === 'moxfield.com' && /^[A-Za-z0-9_-]{4,40}$/.test(parts[1])) {
    return { source: 'moxfield', id: parts[1], api: `https://api2.moxfield.com/v3/decks/all/${parts[1]}` };
  }
  return null;
}

// fetchFn: how to ask the other site (the tests give a fake one)
export function createImportRouter(fetchFn = fetch) {
  const router = Router();
  // A limit per logged-in person, so nobody can use us to hammer those sites
  router.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many imports. Please wait a minute and try again.' },
  }));

  router.get('/deck', async (req, res) => {
    const found = readDeckLink(req.query.url);
    if (!found) {
      return res.status(400).json({ error: 'That isn\'t a link to a deck on Archidekt or Moxfield.' });
    }
    let reply;
    try {
      reply = await fetchFn(found.api, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; WUBRGr deck import)' },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return res.status(502).json({ error: `Couldn't reach ${found.source === 'moxfield' ? 'Moxfield' : 'Archidekt'}. Try again in a moment.` });
    }
    if (reply.status === 404) return res.status(404).json({ error: 'That deck wasn\'t found (is it private?).' });
    if (reply.status === 403 || reply.status === 401) {
      return res.status(502).json({
        error: found.source === 'moxfield'
          ? 'Moxfield wouldn\'t let us read that deck. On Moxfield choose Export, copy the text, and paste it here instead.'
          : 'That deck is private, so it can\'t be read.',
      });
    }
    if (!reply.ok) return res.status(502).json({ error: `The site had a problem (error ${reply.status}). Try again in a moment.` });
    let data;
    try { data = await reply.json(); } catch {
      return res.status(502).json({ error: 'The site sent something we couldn\'t read.' });
    }
    return res.json({ source: found.source, data });
  });

  return router;
}
