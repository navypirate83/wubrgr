/* =====================================================================
   CUTTING A LONG TEXT INTO PIECES AND JOINING IT BACK (plain TypeScript)
   The phone can't read back one saved value that is bigger than about
   2 MB (it stops with "Row too big to fit into CursorWindow"). A binder with
   thousands of cards is saved as one long text, so it can pass that size.
   So a long text is cut into pieces that are each safely small. The pieces
   are saved under their own names, and the main name holds a short note,
   "@parts:3", that says how many pieces to join. Short texts are saved as
   they are, and a note can never be mistaken for one: a binder's text
   always starts with "{".
   ===================================================================== */

// The most characters in one piece. (Some characters take up to 3 bytes when saved, so this
// stays far under the 2 MB limit even for text with many odd characters.)
export const PIECE_SIZE = 500_000;

// The note that stands in for the text when it was cut up, like "@parts:3"
const NOTE_START = '@parts:';

// Cut a text into pieces of at most "size" characters (a short text is a single piece)
export function cutIntoPieces(text: string, size: number = PIECE_SIZE): string[] {
  if (text.length <= size) return [text];
  const pieces: string[] = [];
  for (let from = 0; from < text.length; from += size) pieces.push(text.slice(from, from + size));
  return pieces;
}

// The note saying how many pieces a text was cut into
export function noteFor(pieceCount: number): string {
  return `${NOTE_START}${pieceCount}`;
}

// If this saved value is such a note, how many pieces it names; otherwise null (it is the text itself)
export function pieceCountOf(saved: string): number | null {
  if (!saved.startsWith(NOTE_START)) return null;
  const count = Number(saved.slice(NOTE_START.length));
  return Number.isInteger(count) && count >= 1 && count <= 100_000 ? count : null;
}

// Join the pieces back into the text. Null if any piece is missing.
export function joinPieces(pieces: (string | null)[]): string | null {
  return pieces.some((piece) => piece === null) ? null : (pieces as string[]).join('');
}
