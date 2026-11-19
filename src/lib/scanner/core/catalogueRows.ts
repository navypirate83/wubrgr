/* =====================================================================
   THE ANDROID ADD-ON'S ANSWER, TURNED INTO ROWS (shared, plain TypeScript)
   The Android add-on answers a catalogue question with JSON text:
       {"columns":["id","name"],"rows":[["a","Bolt"],["b",null]]}
   where whole numbers and decimals are numbers, nothing is null, text is text, and a blob of
   bytes is {"b":"<base64 text>"}. This turns that into a list of objects keyed by column name
   (like {id:"a", name:"Bolt"}), with each blob as a Uint8Array: the same shape expo-sqlite used to
   give, so the rest of the catalogue code didn't have to change.
   ===================================================================== */

import { base64ToBytes } from './base64.ts';

// One cell: a blob ({"b": "..."}) becomes bytes, everything else stays as it is
function cell(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { b?: unknown }).b === 'string') {
    return base64ToBytes((value as { b: string }).b);
  }
  return value;
}

// The JSON text from the add-on as rows. Throws an Error if the text isn't the expected shape.
export function parseCatalogueRows(json: string): Record<string, unknown>[] {
  const data = JSON.parse(json) as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error('The catalogue gave an answer in an unexpected shape');
  const columns = data.columns as string[];
  return (data.rows as unknown[][]).map((row) => {
    const object: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) object[columns[i]] = cell(row[i]);
    return object;
  });
}
