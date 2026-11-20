/* =====================================================================
   SCANNER LAB, STEP 3: RUN THE PHOTOS THROUGH THE REAL SCANNER (runs inside the browser page)
   This file is loaded into the website's scan page (see the lab README steps). It then:
     1. swaps the camera for a blank picture (so nothing else competes with the test photos),
     2. feeds each test photo into the scanner exactly like "choose a photo of a card",
     3. waits for the scanner's answer and sorts it:
          RIGHT  = the printing it shows is the right set and collector number,
          WRONG  = it shows a printing, but not the right one (the dangerous kind),
          PICKER = it knows the card but asks which printing,
          NONE   = it could not read the card at all,
     4. sends everything it saw (what the text reader read, the answer) back to the lab server to be saved.
   Nothing is ever added to a binder: the scanner's confirm sheet is only looked at, then closed.
   Use from the page:   await lab.setup();   lab.run('photos.json', { limit: 30, tag: 'first' });   then lab.status() until done.
   ===================================================================== */

(() => {
  const SERVER = 'http://127.0.0.1:8765';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The words currently showing on screen, one entry per small piece of text
  const leaves = () => [...document.querySelectorAll('div,span')]
    .filter((element) => element.offsetParent && element.children.length === 0)
    .map((element) => (element.innerText || '').trim())
    .filter(Boolean);

  // What the scan screen is showing right now
  const state = () => {
    const words = leaves();
    return {
      reading: words.some((text) => /^Reading the card/.test(text)),
      // The confirm sheet: "Set name (CODE) #number"
      sheet: words.find((text) => /^[^()]*\([A-Za-z0-9]{2,6}\) #\S+/.test(text)) || null,
      picker: words.some((text) => /Which printing\?/.test(text)) ? (words.find((text) => /printings fit|alike/.test(text)) || 'picker') : null,
      none: words.some((text) => /Couldn't read that card/.test(text)),
      added: words.some((text) => /^Added |please check the printing/.test(text)),
    };
  };

  // Close any sheet or picker that is open (never "Add to binder")
  const closeAll = async () => {
    for (let k = 0; k < 4; k++) {
      const close = [...document.querySelectorAll('[role=button]')].find((b) => b.offsetParent && b.getAttribute('aria-label') === 'Close');
      if (!close) break;
      close.click();
      await sleep(400);
    }
  };

  // Hand one photo to the scanner, the same way choosing a photo does
  const sendPhoto = async (url) => {
    const input = document.querySelector('input[type=file]');
    const blob = await (await fetch(url)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], url.split('/').pop(), { type: 'image/jpeg' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const lab = {
    results: [],
    done: true,
    progress: '',

    // Blank camera + the right mode. Call once after opening the Scan page.
    async setup() {
      const one = [...document.querySelectorAll('div,span')].find((b) => b.offsetParent && b.children.length === 0 && (b.innerText || '').trim() === 'One card');
      if (one) { one.click(); await sleep(300); }
      const hint = () => leaves().find((text) => /Line the card|Show the whole|Hold still/.test(text)) || '';
      if (/Line the card/.test(hint())) { document.querySelector('[aria-label="Track card"]').click(); await sleep(400); }
      return 'ready: ' + hint();
    },

    // Run photos. "manifest" is a file in the photos folder (a list of { file, set, number, name, group... }).
    // Options: limit (how many), skip (how many to skip first), only (a group name), tag (names the saved result file)
    run(manifest, options = {}) {
      lab.done = false;
      lab.results = [];
      (async () => {
        const list = await (await fetch(`${SERVER}/${manifest}`)).json();
        let photos = options.only ? list.filter((p) => p.group === options.only) : list;
        photos = photos.slice(options.skip || 0, (options.skip || 0) + (options.limit || photos.length));
        for (let n = 0; n < photos.length; n++) {
          const photo = photos[n];
          lab.progress = `${n + 1}/${photos.length}`;
          await closeAll();
          // Wait until the screen is quiet (the last photo's message gone)
          for (let i = 0; i < 40; i++) { const s = state(); if (!s.none && !s.added && !s.sheet && !s.picker && !s.reading) break; await sleep(250); }
          window.__scannerDebug = null;
          window.__scannerOutcome = null;
          // (what each cut-out of the card read and how it scored: the lab hook in ScannerCamera.web.tsx)
          window.__scannerCuts = [];
          const started = performance.now();
          await sendPhoto(`${SERVER}/${options.folder || 'cache/photos'}/${photo.file}`);
          for (let i = 0; i < 20; i++) { await sleep(200); if (state().reading) break; }
          for (let i = 0; i < 400 && state().reading; i++) await sleep(200);
          await sleep(2200);
          const s = state();
          const debug = window.__scannerDebug;
          // Sort the answer: compare the shown set code and number with the right ones
          let outcome = 'NONE';
          let shown = '';
          if (s.sheet) {
            const match = /\(([A-Za-z0-9]+)\) #(\S+)/.exec(s.sheet);
            shown = s.sheet;
            const sameSet = match && match[1].toLowerCase() === String(photo.set).toLowerCase();
            const sameNumber = match && match[2].toLowerCase() === String(photo.number).toLowerCase();
            outcome = sameSet && sameNumber ? 'RIGHT' : 'WRONG';
          } else if (s.picker) { outcome = 'PICKER'; shown = s.picker; }
          // How the scanner worked the card out (the lab hook in ScanScreen.tsx): its status, its reason, and where the RIGHT printing is
          // in the list it offers (0 = first, -1 = not in the list at all)
          const worked = window.__scannerOutcome;
          const tidy = (number) => String(number).toLowerCase().replace(/^0+(?=\d)/, '');
          const truthRank = worked ? (worked.candidates || []).findIndex((c) => c.setCode.toLowerCase() === String(photo.set).toLowerCase() && tidy(c.collectorNumber) === tidy(photo.number)) : null;
          lab.results.push({
            file: photo.file, name: photo.name, set: photo.set, number: photo.number, group: photo.group, finishes: photo.finishes, frame: photo.frame,
            background: photo.background, glare: photo.glare, landscape: photo.landscape,
            status: worked ? worked.status : '', reason: worked ? String(worked.reason || '').slice(0, 170) : '', truthRank, candidateCount: worked ? (worked.candidates || []).length : 0,
            outcome, shown, seconds: +((performance.now() - started) / 1000).toFixed(1),
            cuts: (window.__scannerCuts || []).map((c) => ({ cut: c.cut, group: c.group, score: c.score, name: (c.name || '').slice(0, 50), info: (c.info || '').slice(0, 40) })),
            nameText: debug ? (debug.reading.nameText || '').slice(0, 60) : '', infoText: debug ? (debug.reading.infoText || '').slice(0, 60) : '',
          });
          // Save progress every 10 photos
          if (n % 10 === 9) fetch(`${SERVER}/save/${options.tag || 'run'}.json`, { method: 'POST', body: JSON.stringify(lab.results) });
        }
        await closeAll();
        await fetch(`${SERVER}/save/${options.tag || 'run'}.json`, { method: 'POST', body: JSON.stringify(lab.results) });
        lab.done = true;
      })();
      return 'started';
    },

    status() {
      const counts = {};
      for (const r of lab.results) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
      return JSON.stringify({ done: lab.done, progress: lab.progress, counts });
    },
  };
  window.lab = lab;
})();
