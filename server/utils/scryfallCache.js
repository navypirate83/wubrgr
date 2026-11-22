/* =====================================================================
   LOOK IT UP, REMEMBERING THE ANSWER
   cachedLookup() is how every route gets Scryfall data:
     1. Is the answer in the notebook and still fresh? Use it. Scryfall
        is not contacted at all.
     2. Otherwise ask Scryfall (through the polite client), write the
        answer in the notebook, and return it.
     3. If Scryfall can't be reached or is busy, but an OLD answer is in
        the notebook, return that (marked "stale") instead of an error.
   Two people asking for the same thing at the same moment share one
   lookup.
   THE NOTEBOOK HAS A SIZE LIMIT (trimCache below): the whole database is
   512 MB and is shared with everybody's binders, so the notebook may take
   up to MAX_CACHE_MB of it. Past that, the answers fetched longest ago
   are removed first. Nothing is lost by that: they are only copies, and
   the next lookup asks Scryfall again.
   ===================================================================== */

import ScryfallCache from '../models/ScryfallCache.js';

// How long an old answer is kept as a safety net (30 days past its expiry)
const KEEP_OLD_MS = 30 * 24 * 60 * 60 * 1000;

// Lookups running right now, by key
const running = new Map();

// The most room the notebook may take in the database (megabytes), and how low a tidy-up brings it (so the
// next few answers don't set off another one straight away)
const MAX_CACHE_MB = Number(process.env.SCRYFALL_CACHE_MAX_MB) > 0 ? Number(process.env.SCRYFALL_CACHE_MAX_MB) : 150;
const TRIM_TO = 0.8;
// The size is looked at no more often than this (looking costs a little each time)
const CHECK_EVERY_MS = 10 * 60 * 1000;
let lastCheck = 0;

// Bring the notebook back under its limit by removing the answers fetched longest ago.
// "maxBytes" is the limit (the tests pass a small one). Gives how many answers were removed.
export async function trimCache({ maxBytes = MAX_CACHE_MB * 1024 * 1024 } = {}) {
  // How big is it? (Asked of the database itself, which adds up each answer's size.)
  const [sum] = await ScryfallCache.aggregate([{ $group: { _id: null, bytes: { $sum: { $bsonSize: '$$ROOT' } } } }]);
  let over = (sum?.bytes ?? 0) - maxBytes;
  if (over <= 0) return 0;
  // Over the limit: remove the oldest until it is down to 80% of the limit
  over += maxBytes * (1 - TRIM_TO);
  const oldest = ScryfallCache.aggregate([
    { $sort: { fetchedAt: 1 } },
    { $project: { bytes: { $bsonSize: '$$ROOT' } } },
  ]).cursor();
  const going = [];
  for await (const row of oldest) {
    going.push(row._id);
    over -= row.bytes;
    if (over <= 0) break;
  }
  await ScryfallCache.deleteMany({ _id: { $in: going } });
  return going.length;
}

// After an answer is written: now and then (not every time), check the size in the background. A problem here
// must never spoil the lookup that set it off, so it is only written in the log.
// (Also called after the "many cards at once" lookup writes its answers: see scryfallService.js.)
export function tidyNowAndThen(now = Date.now()) {
  if (now - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = now;
  trimCache().catch((err) => console.error('Could not tidy the Scryfall notebook:', err.message));
}

// key:    what is being asked for ("card:set/lea/1")
// kind:   a short label for the sort of answer ("card")
// ttlMs:  how long the answer counts as fresh
// load:   a function that asks Scryfall and returns the (trimmed) answer
// Returns { data, stale } where stale is true for an old answer used
// because Scryfall couldn't be asked.
export async function cachedLookup({ key, kind, ttlMs, load, now = () => Date.now() }) {
  const saved = await ScryfallCache.findOne({ key }).lean();
  if (saved && saved.expiresAt.getTime() > now()) {
    return { data: saved.data, stale: false };
  }

  // Someone is already fetching this: wait for their answer
  if (running.has(key)) return running.get(key);

  const lookup = (async () => {
    try {
      const data = await load();
      const when = now();
      await ScryfallCache.updateOne(
        { key },
        { $set: {
          kind,
          data,
          fetchedAt: new Date(when),
          expiresAt: new Date(when + ttlMs),
          deleteAt: new Date(when + ttlMs + KEEP_OLD_MS),
        } },
        { upsert: true },
      );
      tidyNowAndThen(Date.now());
      return { data, stale: false };
    } catch (err) {
      // Scryfall said "not found" (404) or "bad request": that IS the
      // answer, an old copy would be wrong. For "can't reach it", "busy"
      // or "had a problem", an old copy is better than nothing.
      const trouble = !err.status || err.status === 429 || err.status >= 500;
      if (saved && trouble) return { data: saved.data, stale: true };
      throw err;
    }
  })();

  running.set(key, lookup);
  try {
    return await lookup;
  } finally {
    running.delete(key);
  }
}


// Check the notebook's size on a clock as well, every ten minutes, whether or not anything was just written.
// (The check after a write never runs if writing itself is failing, which is exactly when the database is
// full and a tidy-up is needed most.) Started once by server.js; the tests don't start it.
export function startTidyingOnAClock() {
  const timer = setInterval(() => tidyNowAndThen(), CHECK_EVERY_MS);
  // (Don't keep the server alive just for this)
  timer.unref?.();
  return timer;
}

