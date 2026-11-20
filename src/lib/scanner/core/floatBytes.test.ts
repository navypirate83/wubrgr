/* =====================================================================
   TESTS for floatBytes.ts: decimals to base64 text and back, and bytes to plain text.
   Run with:  npx tsx --test src/lib/scanner/core/floatBytes.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { base64ToFloats, bytesToText, floatsToBase64 } from './floatBytes.ts';

test('decimals survive the trip to text and back exactly', () => {
  const floats = new Float32Array([0, 1, -1, 0.5, 3.14159274, -2.25, 1e-7, 12345.678]);
  const back = base64ToFloats(floatsToBase64(floats));
  assert.deepEqual([...back], [...floats]);
});

test('a big list (the size of the model input) survives too', () => {
  const floats = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < floats.length; i++) floats[i] = Math.sin(i) * 2;
  const back = base64ToFloats(floatsToBase64(floats));
  assert.equal(back.length, floats.length);
  assert.equal(back[0], floats[0]);
  assert.equal(back[floats.length - 1], floats[floats.length - 1]);
});

test('a list that is a view into a bigger one is written from its own start', () => {
  const whole = new Float32Array([9, 9, 1, 2, 3, 9]);
  const part = whole.subarray(2, 5);
  assert.deepEqual([...base64ToFloats(floatsToBase64(part))], [1, 2, 3]);
});

test('bytes become plain text', () => {
  assert.equal(bytesToText(new TextEncoder().encode('abc-123\nxyz')), 'abc-123\nxyz');
});
