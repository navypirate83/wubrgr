/* =====================================================================
   NUMBERS AS TEXT, FOR TALKING TO THE PHONE'S OWN CODE (plain TypeScript, no imports)
   The Android add-on can only pass text across to the app (see ocr.native.ts), so the AI model's input (150,528 decimals) and its
   answer (about 200,000 decimals) travel as "base64": a way of writing bytes using only ordinary letters and digits.
   These small functions turn decimals into that text and back. They also turn plain text bytes into a string (the phone's
   JavaScript may not have TextDecoder, and the list of artwork ids is plain English letters, digits and dashes).
   ===================================================================== */

// Write a list of decimals (each 4 bytes, the way every phone stores them) as base64 text
export function floatsToBase64(floats: Float32Array): string {
  const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  // (a binary string is built in pieces: one giant argument list would be too long for the phone's JavaScript)
  let text = '';
  for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(text);
}

// Read decimals back from base64 text (always a fresh list that starts on a boundary, so it can be viewed as decimals)
export function base64ToFloats(text: string): Float32Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

// Plain text from bytes: TextDecoder where the phone has it, otherwise letter by letter (fine for the ids: all plain ASCII)
export function bytesToText(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let text = '';
  for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return text;
}
