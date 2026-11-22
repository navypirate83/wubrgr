/* =====================================================================
   SWITCHING A CARD TO ANOTHER PRINTING (shared, plain TypeScript)
   The card screen's Edit mode can show every version of a card (every set
   it was printed in) and swap the card you own for another one of them.
   versionEdit works out what changes (see cardEdit.ts for how a change is
   made). What the card keeps and what it gets:
   - kept: its copies, its condition and its place (pocket, list spot)
   - new: the set and number, the picture, and the details saved with it
     (set name, rarity, colors, type, mana cost, release date)
   - the finish: kept if the new printing comes in it, otherwise the
     nearest one it does come in (a printing made only in foil is foil)
   - the language: English (the list of versions is the English printings)
   ===================================================================== */

import type { BinderCard } from './binderStorage';
import { detailsOf, finishOf } from './cardDetails';
import { finishEdit, type CardEdit } from './cardEdit';
import { finishFor, imageFor, isDoubleSided } from './cards';
import type { ScryfallCard } from './scryfall';

// The change that turns this card into the same card from another printing
export function versionEdit(card: BinderCard, version: ScryfallCard): CardEdit {
  // A card that shows its back keeps showing it, if the new printing has two sides too
  const face = isDoubleSided(version) ? (card.face ?? 0) : 0;
  const finish = finishFor(version, finishOf(card));
  const finishPart = finishEdit(finish);
  return {
    set: version.set,
    number: version.collector_number,
    face,
    image: imageFor(version, face, ['normal', 'large']) ?? card.image,
    lang: null,
    foil: finishPart.foil,
    // "Printed name" is cleared first (null) so a version with its real name doesn't
    // keep the other name of the old one; detailsOf puts it back when the new one has one
    extra: { 'Printed name': null, ...detailsOf(version), ...finishPart.extra },
  };
}
