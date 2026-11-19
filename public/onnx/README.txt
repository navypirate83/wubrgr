Files for the website scanner's "AI art matching" option (ONNX Runtime Web). They are copies,
committed so the site runs the AI model with no outside address and works offline:

  ort.wasm.min.js                 onnxruntime-web 1.31.1 (dist/ort.wasm.min.js, the WebAssembly-only build)
  ort-wasm-simd-threaded.mjs      onnxruntime-web 1.31.1 (dist/ort-wasm-simd-threaded.mjs, its loader)
  ort-wasm-simd-threaded.wasm     onnxruntime-web 1.31.1 (dist/ort-wasm-simd-threaded.wasm, the engine, about 14 MB)

They are only loaded when the scanner first needs the AI (see src/lib/scanner/ai/aiModel.web.ts),
so they never add to the app's main download. The AI model itself and the art fingerprints are not
here: they are downloaded separately (see src/lib/scanner/ai/aiConfig.ts).
To update them, change the onnxruntime-web version in package.json, run npm install, and copy the
same three files from node_modules/onnxruntime-web/dist over these.
Licence: MIT (Microsoft).
