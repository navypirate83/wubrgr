/* =====================================================================
   COLLECTION NAMES
   WUBRG'r shares one MongoDB database with another project
   ("first-server"). Mongoose would name our collections "users" and so
   on, which would mix our data with theirs. So every collection here
   starts with "wubrgr_", and each name is written once, in this file.
   ===================================================================== */

export const COLLECTIONS = {
  user: 'wubrgr_users',
  refreshToken: 'wubrgr_refreshtokens',
  passwordReset: 'wubrgr_passwordresets',
  // Wrong passwords typed for a name that has no account (see models/LoginTry.js)
  loginTry: 'wubrgr_logintries',
  binder: 'wubrgr_binders',
  card: 'wubrgr_cards',
  list: 'wubrgr_lists',
  listCard: 'wubrgr_listcards',
  deck: 'wubrgr_decks',
  deckCard: 'wubrgr_deckcards',
  // A PRISM set: decks sharing physical cards (see models/PrismSet.js)
  prismSet: 'wubrgr_prismsets',
  // Answers remembered from Scryfall (a different thing from "card" above,
  // which is a card sitting in someone's binder)
  scryfallCache: 'wubrgr_scryfallcache',
  // The AI scanner's big files, kept in MongoDB's "GridFS" (a way of storing
  // files too big for one document). GridFS makes two collections from this
  // name: "wubrgr_aifiles.files" and "wubrgr_aifiles.chunks".
  aiFilesBucket: 'wubrgr_aifiles',
};
