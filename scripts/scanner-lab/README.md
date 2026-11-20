# Scanner lab

A way to test the website's card scanner on hundreds of cards without holding any up to a camera.

## How it works
1. `fetch-cards.mjs` downloads random cards from Scryfall (clean scans, each with its right set and number).
2. `make-photos.mjs` turns every scan into a phone-style photo: tilted, a table behind it, shadow, glare, blur, grain.
3. The real scan page is opened in a browser. `harness.js` feeds the photos in one at a time exactly like "choose a photo" and sorts each answer:
   - **RIGHT**: the right printing (set and collector number),
   - **WRONG**: a printing, but the wrong one (the worst result: it would be added silently),
   - **PICKER**: it knew the card but asked which printing,
   - **NONE**: nothing could be read.
4. `report.mjs` shows the totals, the totals for each kind of card, and what the text reader read for every card that was not right.

## Running it
```
python scripts/scanner-lab/lab-server.py                 (leave it running)
node scripts/scanner-lab/fetch-cards.mjs 7               (cards per group; slow on purpose: Scryfall asks for it)
node scripts/scanner-lab/make-photos.mjs 1 photos2 0.9   (photos per card, folder, most blur)
```
Then, in the browser: open `http://localhost:3001/`, swap the camera for a blank one and load `harness.js` (see the top of harness.js), open the Scan tab, and
`await lab.setup(); lab.run('cache/photos2/photos.json', { folder: 'cache/photos2', tag: 'my-run' })`, then `lab.status()` until it says done.
Finally `node scripts/scanner-lab/report.mjs my-run`.

Everything the lab downloads and makes goes in `scripts/scanner-lab/cache/` (not committed).
Nothing is ever added to a binder. Your own real phone photos make a good second test: copy them into `cache/real/` with a `photos.json` like the others.
