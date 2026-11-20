/* =====================================================================
   CHECKS FOR "FOLLOWING CARDS FROM FRAME TO FRAME"
   Run with:  node --test src/lib/scanner/core/tracker.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Tracker, boxOverlap, type Find } from './tracker.ts';
import type { Quad } from './perspective.ts';

// An upright card-shaped find whose top-left corner is at (x, y), 0.2 wide and 0.28 tall
function find(x: number, y: number, score = 0.9): Find {
  const quad: Quad = [{ x, y }, { x: x + 0.2, y }, { x: x + 0.2, y: y + 0.28 }, { x, y: y + 0.28 }];
  return { quad, score };
}

test('two identical boxes overlap fully and far-apart boxes not at all', () => {
  assert.equal(boxOverlap(find(0.1, 0.1).quad, find(0.1, 0.1).quad), 1);
  assert.equal(boxOverlap(find(0.1, 0.1).quad, find(0.6, 0.6).quad), 0);
});

test('a card keeps its number from frame to frame and is "following" after two sightings', () => {
  const tracker = new Tracker();
  tracker.update([find(0.4, 0.3)]);
  assert.equal(tracker.tracks[0].state, 'new');
  const id = tracker.tracks[0].id;
  tracker.update([find(0.41, 0.3)]);
  assert.equal(tracker.tracks.length, 1);
  assert.equal(tracker.tracks[0].id, id);
  assert.equal(tracker.tracks[0].state, 'following');
});

test('a find with a low score does not start a followed card', () => {
  const tracker = new Tracker();
  tracker.update([find(0.4, 0.3, 0.3)]);
  assert.equal(tracker.tracks.length, 0);
});

test('a card missing for up to 3 frames is kept, and forgotten on the 4th', () => {
  const tracker = new Tracker();
  tracker.update([find(0.4, 0.3)]);
  tracker.update([find(0.4, 0.3)]);
  for (let miss = 1; miss <= 3; miss++) {
    tracker.update([]);
    assert.equal(tracker.tracks.length, 1);
    assert.equal(tracker.tracks[0].misses, miss);
  }
  tracker.update([]);
  assert.equal(tracker.tracks.length, 0);
});

test('a card that comes back after a miss is the same card', () => {
  const tracker = new Tracker();
  tracker.update([find(0.4, 0.3)]);
  const id = tracker.tracks[0].id;
  tracker.update([]);
  tracker.update([find(0.4, 0.3)]);
  assert.equal(tracker.tracks[0].id, id);
  assert.equal(tracker.tracks[0].misses, 0);
});

test('two cards side by side are followed separately', () => {
  const tracker = new Tracker();
  tracker.update([find(0.1, 0.3), find(0.6, 0.3)]);
  tracker.update([find(0.11, 0.3), find(0.61, 0.3)]);
  assert.equal(tracker.tracks.length, 2);
  assert.notEqual(tracker.tracks[0].id, tracker.tracks[1].id);
});

test('the centre is smoothed: 60% old plus 40% new', () => {
  const tracker = new Tracker();
  tracker.update([find(0.2, 0.3)]);
  const before = tracker.tracks[0].centre.x;
  tracker.update([find(0.3, 0.3)]);
  const expected = before * 0.6 + (0.3 + 0.1) * 0.4;
  assert.ok(Math.abs(tracker.tracks[0].centre.x - expected) < 1e-9);
});

test('the active card is the followed one nearest the middle, and none while cards are only new', () => {
  const tracker = new Tracker();
  tracker.update([find(0.05, 0.3), find(0.4, 0.36)]);
  assert.equal(tracker.activeTrack(), null);
  tracker.update([find(0.05, 0.3), find(0.4, 0.36)]);
  const active = tracker.activeTrack();
  assert.ok(active);
  assert.ok(Math.abs(active.centre.x - 0.5) < 0.1);
});
