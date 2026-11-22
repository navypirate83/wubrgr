/* =====================================================================
   HOW MUCH ONE ACCOUNT MAY KEEP
   The whole database is 512 MB and everybody shares it. Each binder, list
   and deck already has a limit on its own cards, but with no limit on HOW
   MANY binders, lists and decks an account has, one account could keep
   making full ones until the database was full, and saving would then
   fail for everyone. So an account may have at most:
     - 200 binders, 200 lists and 500 decks
     - 100,000 cards across all of them together (about 50 MB at the most)
   These are far above what anyone really keeps (the busiest account has
   17 binders and about 2,100 cards). Each number can be changed with a
   setting on the server (MAX_BINDERS, MAX_LISTS, MAX_DECKS,
   MAX_ACCOUNT_CARDS) without changing the code.
   Past a limit, the save is refused with a plain sentence and nothing
   already saved is touched.
   ===================================================================== */

import mongoose from 'mongoose';
import Card from '../models/Card.js';
import ListCard from '../models/ListCard.js';
import DeckCard from '../models/DeckCard.js';

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
