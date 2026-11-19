/* =====================================================================
   BASE64 TEXT BACK INTO BYTES (shared, plain TypeScript)
   The Android add-on sends picture-like data (a "blob") as text made of letters, digits, "+" and "/"
   (called base64), because text is the only thing that can travel through its answer. This turns that
   text back into the real bytes. It is written out by hand because the phone's JavaScript engine may not
   have the browser's atob() built in. No imports.
   ===================================================================== */

// The 64 characters, in order: the position of a character in this text is its value (0 to 63)
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// A quick way to find a character's value: LOOKUP[charCode] (-1 means "not a base64 character")
const LOOKUP = new Int8Array(256).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;
// Some writers use "-" and "_" instead of "+" and "/": accept them too
LOOKUP['-'.charCodeAt(0)] = 62;
LOOKUP['_'.charCodeAt(0)] = 63;

// Turn base64 text into bytes. Padding ("=") and line breaks are fine; any other character throws an Error.
export function base64ToBytes(text: string): Uint8Array {
  // Collect the 6-bit values, ignoring "=" padding and white space
  const values: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 61 || code === 10 || code === 13 || code === 32 || code === 9) continue;
    const value = code < 256 ? LOOKUP[code] : -1;
    if (value < 0) throw new Error('Not valid base64 text');
    values.push(value);
  }
  // Every 4 values (24 bits) make 3 bytes; a leftover of 2 values makes 1 byte and of 3 values makes 2 bytes
  if (values.length % 4 === 1) throw new Error('Not valid base64 text');
  const bytes = new Uint8Array(Math.floor((values.length * 6) / 8));
  let out = 0;
  for (let i = 0; i < values.length; i += 4) {
    const a = values[i];
    const b = values[i + 1];
    const c = values[i + 2];
    const d = values[i + 3];
    bytes[out++] = (a << 2) | (b >> 4);
    if (c !== undefined) bytes[out++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) bytes[out++] = ((c & 3) << 6) | d;
  }
  return bytes;
}
