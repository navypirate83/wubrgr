/* =====================================================================
   FOLLOWING CARDS FROM ONE CAMERA FRAME TO THE NEXT (shared, plain TypeScript, no imports of its own
   except the picture types)
   The card finder looks at every frame on its own and only says "a card is here". This file gives each
   card a NAME (a number) that stays with it while it is in view, so the scanner knows frame 7's card is
   the same card as frame 6's, and one bad frame can't make a card disappear and come back as a "new" one.
   It is a port of the "tracker" in the legacy card scanner (see that app's MECHANICS.md, section 5).
   Every number below says whether it was READ from the original Android app ("original") or is a
   choice of ours ("ours").
   The steps for each new frame, in plain words:
     1. Work out how much every found card overlaps every followed card (the overlap of their boxes).
     2. Pair them up, biggest overlap first; a pair must overlap at least 30%.
     3. A paired card moves to its new place (its centre is smoothed so it doesn't jitter), gains a
        sighting, and loses any "missing" count. After 2 sightings it counts as really being followed.
     4. A followed card with no find this frame gets one "miss"; after 4 misses in a row it is forgotten.
     5. A confident find (score 0.5 or more) that matched nobody starts a new followed card.
   ===================================================================== */

import type { Point, Quad } from './perspective.ts';

/* ---------- the rules (numbers) ---------- */

// Original: a find starts a new followed card only if its score is at least this (0 to 1)
export const TRACK_NEW_MIN_SCORE = 0.5;
// Original: a find belongs to a followed card if their boxes overlap by at least this share
export const TRACK_MATCH_MIN_OVERLAP = 0.3;
// Original: the card's smoothed centre is 60% of the old place plus 40% of the new one
export const TRACK_CENTRE_KEEP = 0.6;
export const TRACK_CENTRE_NEW = 0.4;
// Original: a card counts as "being followed" after it was seen this many times
export const TRACK_CONFIRM_HITS = 2;
// Original: a card is forgotten once it has been missing for MORE than this many frames in a row (so 4 misses)
export const TRACK_MAX_MISSES = 3;

/* ---------- the shapes of the things we pass around ---------- */

// One card the finder found in one frame. The corners are fractions of the picture (0 to 1 across and down).
export type Find = {
  quad: Quad;   // top-left, top-right, bottom-right, bottom-left
  score: number; // how sure the finder is that this is a card (0 to 1)
};

// Where a followed card is in its life
export type TrackState =
  | 'new'        // seen once; might be a fluke
  | 'following'; // seen at least twice; worth working on

// One card being followed
export type Track = {
  id: number;       // stays with this card while it is in view
  quad: Quad;       // the corners from the latest frame it was found in
  centre: Point;    // the smoothed middle of the card
  hits: number;     // in how many frames it was found
  misses: number;   // how many frames IN A ROW it has been missing (0 = found in the latest frame)
  state: TrackState;
};

/* ---------- small helpers ---------- */

// The box around a card's four corners: left, top, width, height
function boxOf(quad: Quad): [number, number, number, number] {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return [left, top, Math.max(...xs) - left, Math.max(...ys) - top];
}

// How much two boxes overlap: the shared area divided by the area of both together (0 = apart, 1 = identical)
export function boxOverlap(a: Quad, b: Quad): number {
  const [ax, ay, aw, ah] = boxOf(a);
  const [bx, by, bw, bh] = boxOf(b);
  const shareW = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const shareH = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  const shared = Math.max(0, shareW) * Math.max(0, shareH);
  const both = aw * ah + bw * bh - shared;
  return both > 0 ? shared / both : 0;
}

// The middle of the card
function centreOf(quad: Quad): Point {
  return { x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4 };
}

/* ---------- the tracker ---------- */

// Follows all the cards in view. Create one, then call update() with every frame's finds.
export class Tracker {
  // The cards being followed right now
  tracks: Track[] = [];
  // The number the next new card will get
  private nextId = 1;

  // Forget everything (for example when the camera is switched)
  reset(): void {
    this.tracks = [];
  }

  // Feed in one frame's finds; every followed card is updated. Returns the cards still being followed.
  update(finds: Find[]): Track[] {
    // Steps 1 and 2: list every pair that overlaps enough, then take the biggest overlaps first.
    // (The original solves this as a best-possible assignment; biggest-first gives the same pairs
    // whenever the cards don't overlap each other, which is how cards are normally laid out. Ours.)
    const pairs: { overlap: number; track: number; find: number }[] = [];
    this.tracks.forEach((track, t) => {
      finds.forEach((find, f) => {
        const overlap = boxOverlap(track.quad, find.quad);
        if (overlap >= TRACK_MATCH_MIN_OVERLAP) pairs.push({ overlap, track: t, find: f });
      });
    });
    pairs.sort((a, b) => b.overlap - a.overlap);
    const trackTaken = new Set<number>();
    const findTaken = new Set<number>();
    for (const pair of pairs) {
      if (trackTaken.has(pair.track) || findTaken.has(pair.find)) continue;
      trackTaken.add(pair.track);
      findTaken.add(pair.find);
      // Step 3: move the card to where it was found now
      const track = this.tracks[pair.track];
      const find = finds[pair.find];
      const fresh = centreOf(find.quad);
      track.centre = {
        x: track.centre.x * TRACK_CENTRE_KEEP + fresh.x * TRACK_CENTRE_NEW,
        y: track.centre.y * TRACK_CENTRE_KEEP + fresh.y * TRACK_CENTRE_NEW,
      };
      track.quad = find.quad;
      track.hits += 1;
      track.misses = 0;
      if (track.state === 'new' && track.hits >= TRACK_CONFIRM_HITS) track.state = 'following';
    }
    // Step 4: cards not found this frame get a miss; too many in a row and they are forgotten
    this.tracks.forEach((track, t) => {
      if (!trackTaken.has(t)) track.misses += 1;
    });
    this.tracks = this.tracks.filter((track) => track.misses <= TRACK_MAX_MISSES);
    // Step 5: confident finds that matched nobody start a new followed card
    finds.forEach((find, f) => {
      if (findTaken.has(f) || find.score < TRACK_NEW_MIN_SCORE) return;
      this.tracks.push({ id: this.nextId++, quad: find.quad, centre: centreOf(find.quad), hits: 1, misses: 0, state: 'new' });
    });
    return this.tracks;
  }

  // The card the scanner should work on now: a followed card that was found in the latest frame, the one nearest
  // the middle of the picture. (The original also works on one card at a time; how it picks isn't readable,
  // so nearest-the-middle is our choice.) Returns null when no card is ready.
  activeTrack(): Track | null {
    let best: Track | null = null;
    let bestDistance = Infinity;
    for (const track of this.tracks) {
      if (track.state !== 'following' || track.misses > 0) continue;
      const distance = (track.centre.x - 0.5) ** 2 + (track.centre.y - 0.5) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = track;
      }
    }
    return best;
  }
}
