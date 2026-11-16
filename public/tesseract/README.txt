Files for the website's card scanner text reading (Tesseract.js). They are copies,
committed so the site reads text with no outside address and works offline:

  tesseract.min.js            tesseract.js 7.0.0  (dist/tesseract.min.js)
  worker.min.js               tesseract.js 7.0.0  (dist/worker.min.js)
  core/*-lstm.wasm.js         tesseract.js-core 7.0.0 (the three text-recognition engines: the browser
                              picks the fastest it supports: relaxed SIMD, SIMD, or plain)
  lang/eng.traineddata.gz     @tesseract.js-data/eng 1.0.0, folder 4.0.0_best_int (English, the
                              "best" quality, as small integers: about 3 MB)

They are only loaded when the scanner opens (see src/lib/scanner/ocr/ocr.web.ts), so
they never add to the app's main download. To update them, install those packages in a
scratch folder and copy the same files over these.
Licences: Apache 2.0 (Tesseract.js, Tesseract.js-core and the Tesseract language data).
