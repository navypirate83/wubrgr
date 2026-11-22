/* =====================================================================
   PRISM ROUTES (/prism)
   Mounted behind requireAuth and requirePrism in app.js: only accounts with
   the "prism" right (and admins) may use them, and every request works only
   on the signed-in person's own sets (the owner is never taken from the
   request).
   - GET    /prism            every one of my sets
   - PUT    /prism/:clientId  save a set (made if new, replaced if it exists)
   - DELETE /prism/:clientId  delete a set (fine if it's already gone)
   See models/PrismSet.js for what a set holds.
   ===================================================================== */

import { Router } from 'express';
import mongoose from 'mongoose';
import PrismSet from '../models/PrismSet.js';
import { handleDbError } from '../middleware/errorHandler.js';

const router = Router();

// The most sets one person may keep, and the most cards one set may have
// painted notes for (a whole collection's worth is far less than this)
const MAX_SETS = 100;
const MAX_PAINTED_CARDS = 20000;
const MAX_PINS = 5000;

// How much one account's PRISM sets may take up in the database. A real set (a few thousand painted cards) is
// well under 1 MB; without limits one account could store about 1 GB, twice the size of the whole database.
const MAX_SET_BYTES = 2 * 1024 * 1024;        // one set: 2 MB
const MAX_ACCOUNT_BYTES = 20 * 1024 * 1024;   // all of one account's sets together: 20 MB

const isText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

// A card's name used as a KEY (the label a card's painted marks are filed under). It is a lowercase card name,
// so almost anything goes, dots included ("mr. orfeo, the boulder"). What is refused: nothing at all, more than
// 200 characters, a "$" in front (that means a command to the database), hidden control characters, and the
// three words that mean something special to JavaScript itself, which no card is called.
const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'];
const isCardKey = (key) => typeof key === 'string' && key.length > 0 && key.length <= 200
  && !key.startsWith('$') && !/[\u0000-\u001f\u007f]/.test(key) && !RESERVED_KEYS.includes(key);
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Check one set the app sent. Returns { fields } with only the known
// fields, or { error } saying what is wrong.
function checkSet(body) {
  const { name, corner, decks, pins, painted, names, editedAt } = body ?? {};
  // Older copies of the app don't send this: none then
  const scrape = body?.scrape ?? {};
  if (!isText(name, 60)) return { error: 'The set needs a name of up to 60 letters' };
  if (![0, 1, 2, 3].includes(corner)) return { error: 'The corner must be 0, 1, 2 or 3' };
  if (!Number.isFinite(editedAt) || editedAt < 0) return { error: 'The set needs the time it was last changed' };
  if (!Array.isArray(decks) || decks.length > 48
    || !decks.every((d) => d && isText(d.deckId, 80) && Number.isInteger(d.slot) && d.slot >= 1 && d.slot <= 48)) {
    return { error: 'The decks must be a list of up to 48, each with a deck and a slot from 1 to 48' };
  }
  if (new Set(decks.map((d) => d.slot)).size !== decks.length) return { error: 'Two decks cannot share a slot' };
  if (!Array.isArray(pins) || pins.length > MAX_PINS
    || !pins.every((p) => p && isText(p.deckId, 80) && isText(p.key, 200) && (p.print === undefined || isText(p.print, 60)))) {
    return { error: 'The pins must be a list of decks with a card name and, if only one printing, which' };
  }
  if (!isObject(painted) || Object.keys(painted).length > MAX_PAINTED_CARDS
    || !Object.entries(painted).every(([key, copies]) => isCardKey(key) && Array.isArray(copies)
      && copies.length <= 1000 && copies.every((ids) => Array.isArray(ids) && ids.length <= 48 && ids.every((id) => isText(id, 80))))) {
    return { error: 'What is painted must be, for each card, a list of the decks painted on each copy' };
  }
  if (!isObject(scrape) || Object.keys(scrape).length > MAX_PAINTED_CARDS
    || !Object.entries(scrape).every(([key, copies]) => isCardKey(key) && Array.isArray(copies)
      && copies.length <= 1000 && copies.every((slots) => Array.isArray(slots) && slots.length <= 48
        && slots.every((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 48)))) {
    return { error: 'The marks to scrape must be, for each card, a list of slots (1 to 48) for each copy' };
  }
  if (!isObject(names) || Object.keys(names).length > MAX_PAINTED_CARDS
    || !Object.entries(names).every(([key, shown]) => isCardKey(key) && isText(shown, 200))) {
    return { error: 'The card names must be short text' };
  }
  return {
    fields: {
      name: name.trim(),
      corner,
      decks: decks.map((d) => ({ deckId: d.deckId, slot: d.slot })),
      pins: pins.map((p) => (p.print === undefined ? { deckId: p.deckId, key: p.key } : { deckId: p.deckId, key: p.key, print: p.print })),
      painted,
      scrape,
      names,
      editedAt,
    },
  };
}

// What is sent back for a set
function answer(doc) {
  return {
    clientId: doc.clientId,
    name: doc.name,
    corner: doc.corner,
    decks: doc.decks,
    pins: doc.pins,
    painted: doc.painted ?? {},
    scrape: doc.scrape ?? {},
    names: doc.names ?? {},
    editedAt: doc.editedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const sets = await PrismSet.find({ owner: req.user.sub }).sort({ createdAt: 1 }).lean();
    res.json(sets.map(answer));
  } catch (err) {
    handleDbError(err, res);
  }
});

router.put('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  if (!isText(clientId, 80)) return res.status(400).json({ error: 'That set id is not valid' });
  const checked = checkSet(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  // How big this set is (as text, which is close to what the database stores)
  const setBytes = Buffer.byteLength(JSON.stringify(checked.fields));
  if (setBytes > MAX_SET_BYTES) return res.status(400).json({ error: 'This PRISM set is too big to save (a set can be up to 2 MB)' });
  try {
    // ...and how much the account's OTHER sets already take up (the database adds them up itself)
    const [others] = await PrismSet.aggregate([
      { $match: { owner: new mongoose.Types.ObjectId(req.user.sub), clientId: { $ne: clientId } } },
      { $group: { _id: null, bytes: { $sum: { $bsonSize: '$$ROOT' } } } },
    ]);
    if ((others?.bytes ?? 0) + setBytes > MAX_ACCOUNT_BYTES) {
      return res.status(400).json({ error: 'Your PRISM sets have reached the 20 MB limit. Delete a set you no longer need, then try again.' });
    }
    // A new set: not past the limit
    const exists = await PrismSet.exists({ owner: req.user.sub, clientId });
    if (!exists && (await PrismSet.countDocuments({ owner: req.user.sub })) >= MAX_SETS) {
      return res.status(400).json({ error: `You can keep up to ${MAX_SETS} PRISM sets` });
    }
    const saved = await PrismSet.findOneAndUpdate(
      { owner: req.user.sub, clientId },
      { $set: checked.fields },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    ).lean();
    res.json(answer(saved));
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:clientId', async (req, res) => {
  try {
    await PrismSet.deleteOne({ owner: req.user.sub, clientId: req.params.clientId });
    res.status(204).end();
  } catch (err) {
    handleDbError(err, res);
  }
});

export default router;
