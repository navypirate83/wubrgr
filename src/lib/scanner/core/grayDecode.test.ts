/* =====================================================================
   CHECKS FOR UNPACKING THE PHONE'S GREY PICTURES
   Run with:  node --test src/lib/scanner/core/grayDecode.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeGray, meanBrightness } from './grayDecode.ts';

test('a packed picture comes back as the same pixels', () => {
  const pixels = [0, 10, 128, 255, 77, 200];
  const packed = { width: 3, height: 2, data: Buffer.from(pixels).toString('base64') };
  const picture = decodeGray(packed);
  assert.equal(picture.width, 3);
  assert.equal(picture.height, 2);
  assert.deepEqual(Array.from(picture.data), pixels);
});

test('the average brightness is worked out from the pixels', () => {
  assert.equal(meanBrightness({ data: new Uint8Array([0, 100, 200, 100]), width: 2, height: 2 }), 100);
  assert.equal(meanBrightness({ data: new Uint8Array([]), width: 0, height: 0 }), 0);
});
