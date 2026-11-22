/* =====================================================================
   HOW MUCH ONE ACCOUNT MAY KEEP
   The whole database is 512 MB and everybody shares it. Each binder, list
   and deck already has a limit on its own cards, but with no limit on HOW
   MANY binders, lists and decks an account has, one account could keep
   making full ones until the database was full, and saving would then
   fail for everyone. So an account may have at most:
     - 200 binders, 200 lists and 500 decks
     - 100,000 cards across all of them together
     - 25 MB for all those cards together, measured as the room they
       really take in the database. Counting cards alone is not enough:
       a card may carry notes, and cards stuffed with long notes could
       take twenty times the room of real ones. A real card takes about
       500 bytes, so 25 MB is about 50,000 real cards.
   These are far above what anyone really keeps (the busiest account has
   17 binders, about 2,100 cards and about 1 MB). Each number can be
   changed with a setting on the server (MAX_BINDERS, MAX_LISTS,
   MAX_DECKS, MAX_ACCOUNT_CARDS, MAX_ACCOUNT_MB) without changing the code.
   Past a limit, the save is refused with a plain sentence and nothing
   already saved is touched.
   THE LIMITS ARE CHECKED AS PART OF THE SAVE (saveWithinLimits below):
   counting first and saving afterwards would let twenty saves sent at
   the same instant each see "there is room" and all go through. So the
   cards are written, the account is measured again, and if it is over,
   the whole save is undone, all inside one all-or-nothing "transaction".
   Each save also marks the account's own record first, which makes the
   database run one account's saves one after another, never side by side.
   ===================================================================== */

import mongoose from 'mongoose';
import Card from '../models/Card.js';
import ListCard from '../models/ListCard.js';
import DeckCard from '../models/DeckCard.js';
import User from '../models/User.js';

// A limit from the server's settings, or its usual value when the setting is missing or odd.
// (Read each time it is needed, so the tests can try small limits.)
const setting = (name, usual) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : usual;
};
export const limits = () => ({
  binders: setting('MAX_BINDERS', 200),
  lists: setting('MAX_LISTS', 200),
  decks: setting('MAX_DECKS', 500),
  cards: setting('MAX_ACCOUNT_CARDS', 100000),
  // (megabytes in the setting, bytes here)
  bytes: setting('MAX_ACCOUNT_MB', 25) * 1024 * 1024,
});

// May this account make one more binder, list or deck? Gives a sentence saying why not, or null when it may.
// "Model" is the kind of thing (Binder, List, Deck), "kind" its name in the limits ('binders'...), and
// "word" how to say it ("binders").
export async function roomForOneMore(Model, owner, kind, word) {
  const limit = limits()[kind];
  if ((await Model.countDocuments({ owner })) < limit) return null;
  return `You have reached the limit of ${limit} ${word}. Delete one you no longer need, then try again.`;
}

// May this account keep "adding" more cards? When a binder's (or list's, or deck's) cards are being REPLACED,
// "replacing" says which ones are about to go, so they are not counted twice: { Model, filter }.
// Gives a sentence saying why not, or null when there is room.
export async function roomForCards(owner, adding, replacing = null) {
  const limit = limits().cards;
  const ownerId = new mongoose.Types.ObjectId(String(owner));
  const [inBinders, inLists, inDecks, going] = await Promise.all([
    Card.countDocuments({ owner: ownerId }),
    ListCard.countDocuments({ owner: ownerId }),
    DeckCard.countDocuments({ owner: ownerId }),
    replacing ? replacing.Model.countDocuments(replacing.filter) : 0,
  ]);
  const after = inBinders + inLists + inDecks - going + adding;
  if (after <= limit) return null;
  return `That would be ${after.toLocaleString('en-US')} cards in your account, and the limit is ${limit.toLocaleString('en-US')} across all your binders, lists and decks. Remove some cards, then try again.`;
}


/* ---------- measuring an account, and saving within its limits ---------- */

// How many cards an account has and how much room they take, added up by the database itself across its
// binders, lists and decks. "session" is the transaction to look from inside of (so cards just written
// by it are counted); leave it out to look from outside.
export async function accountUsage(owner, session = null) {
  const ownerId = new mongoose.Types.ObjectId(String(owner));
  const measure = async (Model) => {
    const query = Model.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: null, cards: { $sum: 1 }, bytes: { $sum: { $bsonSize: '$$ROOT' } } } },
    ]);
    if (session) query.session(session);
    const [sum] = await query;
    return { cards: sum?.cards ?? 0, bytes: sum?.bytes ?? 0 };
  };
  // (One after another: a transaction can only do one thing at a time)
  const parts = [await measure(Card), await measure(ListCard), await measure(DeckCard)];
  return { cards: parts.reduce((n, p) => n + p.cards, 0), bytes: parts.reduce((n, p) => n + p.bytes, 0) };
}

// Is this account over a limit right now? Gives the sentence to show, or null when it is within them.
export async function overLimits(owner, session = null) {
  const { cards, bytes } = await accountUsage(owner, session);
  const limit = limits();
  if (cards > limit.cards) {
    return `That would be ${cards.toLocaleString('en-US')} cards in your account, and the limit is ${limit.cards.toLocaleString('en-US')} across all your binders, lists and decks. Remove some cards, then try again.`;
  }
  if (bytes > limit.bytes) {
    return `That would take your account past the ${Math.round(limit.bytes / 1048576)} MB it may keep across all your binders, lists and decks. Remove some cards, then try again.`;
  }
  return null;
}

// The reason a save was undone (only used inside this file, to stop the transaction)
class OverLimit extends Error {}

// Save cards as ONE all-or-nothing step that also keeps the account within its limits.
// "write" does the saving: it is handed the transaction ("session") and must use it for everything it writes.
// Gives null when the save went through, or the sentence to show when it was undone for being over a limit.
export async function saveWithinLimits(owner, write) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Mark the account's own record first. Two saves of one account that run at the same moment both want
      // to change this one record, so the database makes the second wait for (and then see) the first.
      await User.updateOne({ _id: owner }, { $inc: { cardSaves: 1 } }, { session });
      await write(session);
      // Now that the cards are written: is the account still within its limits? If not, everything above is undone.
      const full = await overLimits(owner, session);
      if (full) throw new OverLimit(full);
    });
    return null;
  } catch (err) {
    if (err instanceof OverLimit) return err.message;
    throw err;
  } finally {
    await session.endSession();
  }
}

