/* =====================================================================
   WHEN A SCAN IS WORTH KEEPING FOR TRAINING (shared, plain TypeScript)
   Accounts with the "trainer" right send the scanner's photos to the server
   (see lib/scanner/trainerUpload.ts and the server's routes/training.js) so
   they can be used later to make the scanner better. Not every photo is sent,
   only the ones that teach something:
     - "wrong"    the person ticked "Wrong" on the card in the list
     - "changed"  the person changed the printing or the language (the scanner
                  got it wrong, and now we know the right answer)
     - "unsure"   the scanner wasn't sure which printing it was
   Changing the finish (foil, etched) or the number of copies is NOT a change
   that counts: a photo can't show whether a card is foil, so that tells the
   scanner nothing. (A card nothing could be read from is "unread", which has
   no card and is handled where the scan arrives.)
   ===================================================================== */

// What the scanner itself answered for a card, kept with it so a later change can be told apart:
// the printing it picked (or its best guess), the language, and how sure it was
export type Said = {
  printingId: string;
  name: string;
  set: string;
  number: string;
  lang: string;
  finish: string;
  status: 'sure' | 'likely' | 'pick';
};

export type TrainingReason = 'unsure' | 'changed' | 'wrong';

// The part of a card on the list that decides this
export type TrainingCard = { wrong?: boolean; said?: Said; printing: { id: string }; lang: string };

// Why this card's photo should be kept, or null when it shouldn't (the scanner was sure and nothing was corrected)
export function trainingReason(card: TrainingCard): TrainingReason | null {
  if (card.wrong) return 'wrong';
  if (!card.said) return null;
  if (card.printing.id !== card.said.printingId || card.lang !== card.said.lang) return 'changed';
  return card.said.status === 'sure' ? null : 'unsure';
}
