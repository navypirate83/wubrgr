/* =====================================================================
   SCANNER LAB EXPERIMENT: WHICH WAY OF READING THE INFO LINE FINDS THE COLLECTOR NUMBER BEST?
   The info line (bottom left: collector number, rarity, set code, language) is the scanner's best way to tell printings apart,
   but it is tiny, so reading it fails often. This tries several ways of cutting out and preparing that part of a straightened card,
   and counts, for each way, how many cards gave back the TRUE collector number. The ways it tries:
     - the way the scanner reads it now (black and white, 3.5 times bigger, block-of-text mode),
     - the same picture read as scattered text, or at a different size,
     - the picture kept as grey (with its contrast stretched) instead of black and white,
     - a taller or wider cut-out (the line sits a little differently on different frames).
   A way "finds the number" when the digits of the true number appear as a run in what was read.
   It runs inside the scan page; the straightened cards come from make-flats.mjs (cache/flats).
   Use from the page:  await ocrInfo.run();   then read the table it returns.
   ===================================================================== */

(() => {
  const SERVER = 'http://127.0.0.1:8765';
  const SCANNER_BOX = [0.03, 0.885, 0.23, 0.985];   // the scanner's info line box (shares of the card: left, top, right, bottom)
  const WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ•·/★*+.-★';

  const grayOf = (data) => { const g = new Uint8Array(data.length / 4); for (let i = 0; i < g.length; i++) g[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]); return g; };
  const otsu = (g) => {
    const h = new Array(256).fill(0); g.forEach((v) => h[v]++);
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * h[t];
    let bs = 0, bc = 0, best = -1, line = 128;
    for (let t = 0; t < 256; t++) { bc += h[t]; if (!bc) continue; const fc = g.length - bc; if (!fc) break; bs += t * h[t]; const v = bc * fc * (bs / bc - (sum - bs) / fc) ** 2; if (v > best) { best = v; line = t; } }
    return line;
  };
  // Wipe black blobs that touch the edge of the picture (like removeEdgeBlobs in core/ocrPrep.ts)
  const wipeEdgeBlobs = (bin, w, h) => {
    const seen = new Uint8Array(bin.length), stack = [], wiped = [];
    const start = (x, y) => { const k = y * w + x; if (bin[k] === 0 && !seen[k]) { seen[k] = 1; stack.push(k); } };
    for (let x = 0; x < w; x++) { start(x, 0); start(x, h - 1); }
    for (let y = 0; y < h; y++) { start(0, y); start(w - 1, y); }
    while (stack.length) { const k = stack.pop(); wiped.push(k); const x = k % w, y = (k / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const nk = ny * w + nx; if (bin[nk] === 0 && !seen[nk]) { seen[nk] = 1; stack.push(nk); } } }
    let black = 0; for (let i = 0; i < bin.length; i++) if (bin[i] === 0) black++;
    if (wiped.length && wiped.length <= 0.6 * black) for (const k of wiped) bin[k] = 255;
  };
  const stretch = (g) => {
    const h = new Array(256).fill(0); g.forEach((v) => h[v]++);
    let seen = 0, low = 0; while (low < 255 && seen + h[low] < g.length * 0.02) seen += h[low++];
    seen = 0; let high = 255; while (high > 0 && seen + h[high] < g.length * 0.02) seen += h[high--];
    const spread = Math.max(1, high - low);
    return g.map((v) => Math.max(0, Math.min(255, Math.round(((v - low) / spread) * 255))));
  };
  const toCanvas = (g, w, h) => {
    const m = Math.round(h * 0.15), c = document.createElement('canvas'); c.width = w + 2 * m; c.height = h + 2 * m;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < g.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g[i]; img.data[i * 4 + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, m, m); return c;
  };
  // Cut a box out of the card and make it ready: "mode" binary (black and white) or grey (stretched)
  const prepare = (image, box, scale, mode) => {
    const x = box[0] * image.width, y = box[1] * image.height, w = (box[2] - box[0]) * image.width, h = (box[3] - box[1]) * image.height;
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; cx.drawImage(image, x, y, w, h, 0, 0, c.width, c.height);
    const g = grayOf(cx.getImageData(0, 0, c.width, c.height).data);
    if (mode === 'grey') return toCanvas(stretch(g), c.width, c.height);
    const line = otsu(g); let below = 0; g.forEach((v) => { if (v <= line) below++; });
    const darkBg = below * 2 > g.length;
    const bin = new Uint8Array(g.length); for (let i = 0; i < g.length; i++) bin[i] = ((g[i] <= line) !== darkBg) ? 0 : 255;
    wipeEdgeBlobs(bin, c.width, c.height);
    return toCanvas(bin, c.width, c.height);
  };

  const numberRead = (text, number) => { const digits = String(number).replace(/\D/g, '').replace(/^0+/, ''); return !!digits && (text.match(/\d+/g) || []).some((run) => run.replace(/^0+/, '').includes(digits)); };

  // The ways to try. Each: the box, the size, the picture mode, and the reading mode (6 = a block of text, 11 = scattered text)
  const WAYS = {
    'A now (box, x3.5, b/w, block)': { box: SCANNER_BOX, scale: 3.5, mode: 'binary', psm: '6' },
    'B scattered text (psm 11)': { box: SCANNER_BOX, scale: 3.5, mode: 'binary', psm: '11' },
    'C smaller x2 (block)': { box: SCANNER_BOX, scale: 2, mode: 'binary', psm: '6' },
    'D grey stretched (block)': { box: SCANNER_BOX, scale: 3, mode: 'grey', psm: '6' },
    'E grey stretched (scattered)': { box: SCANNER_BOX, scale: 3, mode: 'grey', psm: '11' },
    'F taller box (block)': { box: [0.03, 0.87, 0.25, 0.995], scale: 3, mode: 'binary', psm: '6' },
    'G wider box (scattered)': { box: [0.02, 0.88, 0.32, 0.99], scale: 3, mode: 'binary', psm: '11' },
    'H bigger x5 (scattered)': { box: SCANNER_BOX, scale: 5, mode: 'binary', psm: '11' },
  };

  window.ocrInfo = {
    async run(limit = 100) {
      const flats = (await (await fetch(`${SERVER}/cache/flats/flats.json`)).json()).slice(0, limit);
      const root = location.origin + '/tesseract';
      const worker = await window.Tesseract.createWorker('eng', 1, { workerPath: root + '/worker.min.js', corePath: root + '/core', langPath: root + '/lang', gzip: true });
      const found = Object.fromEntries(Object.keys(WAYS).map((k) => [k, 0]));
      let anyWay = 0, nowOrB = 0, nowOrBorC = 0;
      const rows = [];
      for (const flat of flats) {
        const image = new Image(); image.crossOrigin = 'anonymous'; image.src = `${SERVER}/cache/flats/${flat.file}`; await image.decode();
        const hits = {};
        for (const [label, way] of Object.entries(WAYS)) {
          await worker.setParameters({ tessedit_pageseg_mode: way.psm, tessedit_char_whitelist: WHITELIST, preserve_interword_spaces: 1 });
          const text = (await worker.recognize(prepare(image, way.box, way.scale, way.mode))).data.text.trim().replace(/\n/g, ' / ');
          hits[label] = numberRead(text, flat.number);
          if (hits[label]) found[label]++;
        }
        const labels = Object.keys(WAYS);
        if (labels.some((l) => hits[l])) anyWay++;
        if (hits[labels[0]] || hits[labels[1]]) nowOrB++;
        if (hits[labels[0]] || hits[labels[1]] || hits[labels[2]]) nowOrBorC++;
        rows.push(`${flat.name.slice(0, 22).padEnd(22)} #${String(flat.number).padEnd(5)} ${labels.map((l) => (hits[l] ? l[0] : '.')).join(' ')}`);
      }
      await worker.terminate();
      const summary = Object.entries(found).map(([label, n]) => `${label.padEnd(32)} number found for ${String(n).padStart(2)} of ${flats.length}`);
      return summary.join('\n') + `\n\nwhat the scanner does now (A then B as its retry): ${nowOrB}; adding C as well: ${nowOrBorC}; ANY of the ways: ${anyWay} of ${flats.length}\n\n` + rows.join('\n');
    },
  };
})();
