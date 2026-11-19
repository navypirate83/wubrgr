/* =====================================================================
   THE AI MODEL: WHAT THE SCANNER CAN ASK OF IT
   The model (DINOv2-small, a file called model.onnx) looks at a picture and
   answers with a list of numbers, the picture's "fingerprint". Running it
   is different on each kind of device, so the real work lives in
   aiModel.web.ts (the website) and aiModel.native.ts (Android); the app
   picks the right one when it is built. This file says what they all offer,
   and is the answer given by anywhere that has no model (a "not here" one).
   - available: can this build run the model at all?
   - embed(tensor): hand it the model's input (3 x 224 x 224 decimals, see
     core/modelInput.ts) and get back the 768-number fingerprint
     (core/modelInput.ts poolTokens boils the model's raw answer down to it).
   ===================================================================== */

export type AiModel = {
  available: boolean;
  embed(tensor: Float32Array): Promise<Float32Array>;
};

// The "not here" model: nothing can run, so the scanner goes on without the AI
export const aiModel: AiModel = {
  available: false,
  embed: async () => { throw new Error('The AI model is not part of this build'); },
};
