# Putting the AI fingerprint into the scanner

Started 2026-11-19. Goal: the scanner uses a small on-device AI model (DINOv2-small) to match a card's
artwork, blended with the art hash it already uses, and finds the card in busy photos (fingers, tables, other
cards) with the better "outline" card finder.

## What the tests showed (32 real phone photos, scripts/catalogue/embed/real-photos-results.md)
- Right card first: 31 of 32 (the photo-finding step matters as much as the model).
- Right printing among one card's artworks: AI 13 of 13, art hash 11 of 13.
- Not yet shown: how it does on photos it wasn't tuned on. Collect more photos for that.

## What the app does today
1. Text reading (ML Kit on Android, Tesseract on the web) reads the name and the info line.
2. Fuzzy name match, then set + number if readable, else the art hash + set symbol + border + year (core/rank.ts).
3. The card is found in the photo by the camera file (native) or cardFinder.ts (web).

## The pieces to build (in order)
1. **Blend in the ranking** (core/rank.ts): an AI similarity per printing added to the art-hash clue; weights tuned on the
   real photos. Pure TypeScript, tested in Node.
2. **The AI index in the app**: art-vectors.bin (14.6 MB), art-ids.txt (2.1 MB), projection.bin (0.8 MB) and the model
   (dinov2-small-q.onnx, 24 MB) downloaded with the catalogue (not bundled), kept on the device.
3. **Picture preparation** (pure TS): an RGB crop of the artwork -> the 224 x 224 numbers the model wants.
4. **The outline card finder** (pure TS port of the one in the test script) for the web scanner; the Android camera
   gets its own version or sends the crop it already makes.
5. **Running the model**: web first (onnxruntime-web, testable in the integrated browser), then Android (a native
   ONNX runtime inside the card-text-reader add-on). Android needs a new build: ASK FIRST.
6. **Wire it into scanResolve.ts** and the scanner screen; Settings switch to turn the AI off; Help updated.
7. **Publish the extra files** with the catalogue release: outward-facing, ASK FIRST.
8. **Test on a phone** with a fresh set of photos; tune; then decide whether it becomes the default.

## Rules for this work
- No Android/EAS build, no publishing of the catalogue release, and no commit of the experiment files without asking.
- Everything stays switchable and falls back to today's scanner if the AI files are missing.
