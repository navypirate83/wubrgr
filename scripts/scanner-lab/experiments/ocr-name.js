/* =====================================================================
   SCANNER LAB EXPERIMENT: WHICH WAY OF PREPARING THE TITLE PICTURE READS NAMES BEST?
   The text reader (Tesseract) works on a picture of the card's title. The scanner currently turns that
   picture into pure black and white first (core/ocrPrep.ts). On a plain title bar that is ideal, but on
   a textured one (old frames, foil, coloured bars) it can break the letters up. This tries several ways of
   preparing the same picture and counts, for each way, how many cards came out with a name close to the
   real one. It runs inside the scan page (see harness.js for how the page is opened); the straightened
   cards it reads were saved by the lab (cache/flats).
   Use from the page:  await ocrName.run();   then read the table it returns.
   ===================================================================== */

(() => {
  const SERVER = 'http://127.0.0.1:8765';
  const NAME_BOX = [0.05, 0.04, 0.74, 0.095];   // the scanner's title box (as shares of the card: left, top, right, bottom)

  // How alike two pieces of text are, 0 to 1 (1 minus the number of single-letter changes needed, over the longer length)
  const likeness = (a, b) => {
    const x = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const y = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!x || !y) return 0;
    const row = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= y.length; j++) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (x[i - 1] === y[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return 1 - row[y.length] / Math.max(x.length, y.length);
  };

  // The best likeness of the true name to any window of the read text (so extra junk before or after doesn't count against it)
  const bestLikeness = (read, truth) => {
    const cleaned = read.replace(/\n/g, ' ');
    let best = likeness(cleaned, truth);
    const words = cleaned.split(/\s+/);
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= Math.min(words.length, start + 8); end++) best = Math.max(best, likeness(words.slice(start, end).join(' '), truth));
    }
    return best;
  };

  const grayOf = (data) => { const g = new Uint8Array(data.length / 4); for (let i = 0; i < g.length; i++) g[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]); return g; };
  const otsu = (g) => {
    const h = new Array(256).fill(0); g.forEach((v) => h[v]++);
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * h[t];
    let bs = 0, bc = 0, best = -1, line = 128;
    for (let t = 0; t < 256; t++) { bc += h[t]; if (!bc) continue; const fc = g.length - bc; if (!fc) break; bs += t * h[t]; const v = bc * fc * (bs / bc - (sum - bs) / fc) ** 2; if (v > best) { best = v; line = t; } }
    return line;
  };

  // Put a grey picture (a list of 0 to 255) on a canvas with a white margin round it (the reader likes a margin)
  const toCanvas = (g, w, h, invert) => {
    const c = document.createElement('canvas'); const m = Math.round(h * 0.15);
    c.width = w + 2 * m; c.height = h + 2 * m;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < g.length; i++) { const v = invert ? 255 - g[i] : g[i]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, m, m);
    return c;
  };

  // The ways of preparing the title picture. Each takes the grey crop (list, width, height) and gives a canvas.
  const VARIANTS = {
    // what the scanner does now: pure black and white, text as the smaller side
    'A black-and-white (now)': (g, w, h) => {
      const line = otsu(g); let below = 0; g.forEach((v) => { if (v <= line) below++; });
      const darkBg = below * 2 > g.length;
      return toCanvas(g.map((v) => ((v <= line) !== darkBg ? 0 : 255)), w, h, false);
    },
    // the plain grey picture, as it is
    'B plain grey': (g, w, h) => toCanvas(g, w, h, false),
    // the grey picture stretched so the darkest 2% is black and the lightest 2% is white (more contrast)
    'C grey, stretched contrast': (g, w, h) => {
      const sorted = [...g].sort((a, b) => a - b); const lo = sorted[Math.floor(g.length * 0.02)], hi = sorted[Math.floor(g.length * 0.98)];
      return toCanvas(g.map((v) => Math.max(0, Math.min(255, ((v - lo) / Math.max(1, hi - lo)) * 255))), w, h, false);
    },
    // black and white decided spot by spot (each pixel against the average of the area round it): copes with uneven light and textures
    'D black-and-white by area': (g, w, h) => {
      const r = Math.max(8, Math.round(h * 0.45)); const out = new Uint8Array(g.length);
      // a running sum over the picture lets the average of any box be found quickly
      const sums = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row; } }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        const total = sums[y1 * (w + 1) + x1] - sums[y0 * (w + 1) + x1] - sums[y1 * (w + 1) + x0] + sums[y0 * (w + 1) + x0];
        out[y * w + x] = g[y * w + x] < (total / ((x1 - x0) * (y1 - y0))) * 0.88 ? 0 : 255;
      }
      return toCanvas(out, w, h, false);
    },
    // the grey picture turned light-for-dark (for pale text on a dark bar)
    'E grey, inverted': (g, w, h) => toCanvas(g, w, h, true),
  };

  const ocrName = {
    // Try every way on every saved flat card. Returns a table (text) and the details.
    async run(limit = 100) {
      const flats = (await (await fetch(`${SERVER}/cache/flats/flats.json`)).json()).slice(0, limit);
      const root = location.origin + '/tesseract';
      const worker = await window.Tesseract.createWorker('eng', 1, { workerPath: root + '/worker.min.js', corePath: root + '/core', langPath: root + '/lang', gzip: true });
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '', preserve_interword_spaces: 1 });
      const totals = Object.fromEntries(Object.keys(VARIANTS).map((k) => [k, { good: 0, sum: 0 }]));
      const lines = [];
      for (const flat of flats) {
        const image = new Image(); image.crossOrigin = 'anonymous'; image.src = `${SERVER}/cache/flats/${flat.file}`; await image.decode();
        const x = NAME_BOX[0] * image.width, y = NAME_BOX[1] * image.height, w = (NAME_BOX[2] - NAME_BOX[0]) * image.width, h = (NAME_BOX[3] - NAME_BOX[1]) * image.height;
        const scale = 3;
        const crop = document.createElement('canvas'); crop.width = Math.round(w * scale); crop.height = Math.round(h * scale);
        const cx = crop.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; cx.drawImage(image, x, y, w, h, 0, 0, crop.width, crop.height);
        const grey = grayOf(cx.getImageData(0, 0, crop.width, crop.height).data);
        const row = [];
        for (const [label, prepare] of Object.entries(VARIANTS)) {
          const text = (await worker.recognize(prepare(grey, crop.width, crop.height, flat))).data.text.trim().replace(/\n/g, ' ');
          const like = bestLikeness(text, flat.name);
          totals[label].sum += like;
          if (like >= 0.85) totals[label].good++;
          row.push(`${label[0]}:${like.toFixed(2)}`);
        }
        lines.push(`${flat.name.slice(0, 24).padEnd(24)} ${row.join('  ')}`);
      }
      await worker.terminate();
      const summary = Object.entries(totals).map(([label, t]) => `${label.padEnd(28)} names read well: ${String(t.good).padStart(2)} of ${flats.length}   average likeness ${(t.sum / flats.length).toFixed(2)}`);
      return summary.join('\n') + '\n\n' + lines.join('\n');
    },
  };
  window.ocrName = ocrName;
})();
