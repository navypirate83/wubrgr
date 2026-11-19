/* =====================================================================
   CHECKS FOR CUTTING A TEXT INTO PIECES
   Run with:  node --test src/lib/chunkedText.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECE_SIZE, cutIntoPieces, joinPieces, noteFor, pieceCountOf } from './chunkedText.ts';

test('a short text is one piece and a long one is cut into pieces that join back exactly', () => {
  assert.deepEqual(cutIntoPieces('abc', 10), ['abc']);
  assert.deepEqual(cutIntoPieces('', 10), ['']);
  const text = 'x'.repeat(25) + 'é日本語😀';
  const pieces = cutIntoPieces(text, 10);
  assert.ok(pieces.length >= 3);
  assert.ok(pieces.every((piece) => piece.length <= 10));
  assert.equal(joinPieces(pieces), text);
});

test('the piece size keeps every piece well under the 2 MB reading limit', () => {
  assert.ok(PIECE_SIZE * 3 < 2 * 1024 * 1024);
});

test('the note says how many pieces, and a binder text is never taken for a note', () => {
  assert.equal(noteFor(3), '@parts:3');
  assert.equal(pieceCountOf('@parts:3'), 3);
  assert.equal(pieceCountOf('{"1-1":{"name":"Bolt"}}'), null);
  assert.equal(pieceCountOf('@parts:0'), null);
  assert.equal(pieceCountOf('@parts:x'), null);
  assert.equal(pieceCountOf('@parts:2.5'), null);
});

test('joining gives nothing when a piece is missing', () => {
  assert.equal(joinPieces(['a', null, 'c']), null);
  assert.equal(joinPieces(['a', 'b']), 'ab');
});
