/* =====================================================================
   TESTS FOR THE ANDROID CATALOGUE ANSWER HELPERS
   Run with:  node --test src/lib/scanner/core/catalogueRows.test.ts
   They check the base64 decoder against Node's own, the turning of the add-on's JSON into rows, and (when the
   built catalogue file is on this computer) that the real SQL questions of the app work with SQLite's typed values,
   which is how the Android add-on asks them (numbers as numbers, text as text).
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { base64ToBytes } from './base64.ts';
import { parseCatalogueRows } from './catalogueRows.ts';
import { SQL, rowToPrinting, rowsToInfo } from './catalogueQueries.ts';

test('base64 decoding matches Node for every length', () => {
  for (let length = 0; length < 40; length++) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length * 11) & 255);
    const text = Buffer.from(bytes).toString('base64');
    assert.deepEqual([...base64ToBytes(text)], [...bytes]);
  }
});

test('base64 decoding accepts missing padding and line breaks, and refuses bad text', () => {
  assert.deepEqual([...base64ToBytes('TWE')], [77, 97]);
  assert.deepEqual([...base64ToBytes('TW\nE=')], [77, 97]);
  assert.throws(() => base64ToBytes('TW$E'));
  assert.throws(() => base64ToBytes('T'));
});

test('JSON rows become objects with numbers, null, text and bytes', () => {
  const json = JSON.stringify({ columns: ['n', 'f', 'z', 's', 'h'], rows: [[1, 2.5, null, 'x', { b: 'AQID' }], [0, -1, null, '', { b: '' }]] });
  const rows = parseCatalogueRows(json);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].n, 1);
  assert.equal(rows[0].f, 2.5);
  assert.equal(rows[0].z, null);
  assert.equal(rows[0].s, 'x');
  assert.ok(rows[0].h instanceof Uint8Array);
  assert.deepEqual([...(rows[0].h as Uint8Array)], [1, 2, 3]);
  assert.equal((rows[1].h as Uint8Array).length, 0);
  assert.deepEqual(parseCatalogueRows('{"columns":["a"],"rows":[]}'), []);
  assert.throws(() => parseCatalogueRows('{"nope":1}'));
});

// The built catalogue (the test is skipped when it is not on this computer)
const FILE = fileURLToPath(new URL('../../../../scripts/catalogue/out-flavor/catalogue.db', import.meta.url));
const present = existsSync(FILE);

test('the real SQL questions work with typed values on the real catalogue', { skip: !present }, () => {
  const db = new DatabaseSync(FILE, { readOnly: true });
  try {
    // The meta rows
    const info = rowsToInfo(db.prepare(SQL.meta).all() as Record<string, unknown>[]);
    assert.ok(info.printings > 0);
    // LIMIT ? with a real number
    const starts = db.prepare(SQL.byFrontNameStart).all('lightning%', 5) as Record<string, unknown>[];
    assert.ok(starts.length > 0 && starts.length <= 5);
    const printing = rowToPrinting(starts[0]);
    assert.ok(printing.name.length > 0);
    // By set and number, and by exact front name
    assert.ok(db.prepare(SQL.bySetAndNumber).all(printing.setCode, printing.collectorNumber).length > 0);
    assert.ok(db.prepare(SQL.byFrontName).all('lightning bolt').length > 0);
    // Sets, names, symbols
    assert.ok(db.prepare(SQL.setCodes).all().length > 0);
    assert.ok(db.prepare(SQL.allSets).all().length > 0);
    assert.ok(db.prepare(SQL.frontNames).all().length > 0);
    assert.equal(db.prepare(SQL.setSymbol).all(printing.setCode).length, 1);
    // The art fingerprints are blobs
    const art = db.prepare('SELECT illus, hash FROM art LIMIT 3').all() as { illus: string; hash: unknown }[];
    assert.ok(art.length > 0);
    assert.ok(art[0].hash instanceof Uint8Array);
    assert.ok(db.prepare(SQL.artHash).all(art[0].illus).length >= 1);
    // The flavor names (a catalogue built before this existed may lack the table)
    try { db.prepare(SQL.flavorNames).all(); } catch { /* an old catalogue */ }
    // The special looks of some printings: one ? for each id
    const ids = starts.map((r) => String(r.id));
    const looks = db.prepare(`${SQL.looksStart}(${ids.map(() => '?').join(', ')})`).all(...ids);
    assert.ok(Array.isArray(looks));
  } finally {
    db.close();
  }
});
