/* =====================================================================
   DELETING AN ACCOUNT AND EVERYTHING IN IT
   One place that knows everything an account owns, so the two ways an
   account can be deleted (the person deleting their own, in routes/auth.js,
   and an admin deleting someone's, in routes/admin.js) remove exactly the same
   things: binders and their cards, lists and their cards, decks and their
   cards, PRISM sets, every sign-in, any waiting password-reset code, and the
   account itself. It cannot be undone.
   (Nothing in a person's own Google Drive is touched: the server has no
   access to it.)
   ===================================================================== */

import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import Binder from '../models/Binder.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import ListCard from '../models/ListCard.js';
import Deck from '../models/Deck.js';
import DeckCard from '../models/DeckCard.js';
import PrismSet from '../models/PrismSet.js';
import PasswordReset from '../models/PasswordReset.js';

// "owner" is the account's _id
export async function deleteAccountAndData(owner) {
  await Promise.all([
    Card.deleteMany({ owner }),
    ListCard.deleteMany({ owner }),
    Binder.deleteMany({ owner }),
    List.deleteMany({ owner }),
    DeckCard.deleteMany({ owner }),
    Deck.deleteMany({ owner }),
    PrismSet.deleteMany({ owner }),
    RefreshToken.deleteMany({ user: owner }),
    PasswordReset.deleteMany({ user: owner }),
  ]);
  await User.deleteOne({ _id: owner });
}
