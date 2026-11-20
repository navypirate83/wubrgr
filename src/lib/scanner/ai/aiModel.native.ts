/* =====================================================================
   THE AI MODEL: ANDROID
   Runs the SAME model file the website uses (model.onnx, DINOv2-small) on the phone, with Microsoft's ONNX runtime for Android, which lives in
   our own text-reader add-on (modules/card-text-reader: runModel). The app does the picture preparation and the pooling of the answer
   (core/modelInput.ts, shared with the website, so the fingerprints come out the same); the add-on only runs the model:
     embed(tensor): the tensor's decimals go to the add-on as base64 text, the add-on runs the model on the downloaded file
     (aiStore.native.ts keeps it) and sends the model's raw answer back the same way, and poolTokens boils it down to the
     768-number fingerprint.
   NEW NATIVE CODE, not yet tried on a phone. The add-on is looked for only when it is needed (never when the Scan screen opens), and a
   build without runModel simply says "not available": the AI switch stays hidden and the scanner works as it did before.
   ===================================================================== */

import { requireOptionalNativeModule } from 'expo';
import { base64ToFloats, floatsToBase64 } from '../core/floatBytes';
import { poolTokens } from '../core/modelInput';
import { mark } from '../crashTrail';
import { aiStore } from './aiStore';
import type { AiModel } from './aiModel';

// What the add-on offers for the model
type ModelAddOn = {
  // Run the model file at "modelPath" on one input (3 x 224 x 224 decimals as base64); gives the answer's shape and decimals (base64)
  runModel(modelPath: string, tensorBase64: string): Promise<{ dims: number[]; data: string }>;
};

// The add-on, found the first time it is needed (null when this build doesn't have the model runner)
let found: ModelAddOn | null | undefined;
function addOn(): ModelAddOn | null {
  if (found === undefined) {
    try {
      const module = requireOptionalNativeModule<Partial<ModelAddOn>>('CardTextReader');
      found = module && typeof module.runModel === 'function' ? (module as ModelAddOn) : null;
    } catch {
      found = null;
    }
  }
  return found;
}

export const aiModel: AiModel = {
  // Only a build that has the model runner can use the AI (looked up when asked, not when this file is loaded)
  get available() {
    return addOn() !== null;
  },
  async embed(tensor) {
    const runner = addOn();
    const path = aiStore.path('model.onnx');
    if (!runner || !path) throw new Error('The AI model is not in this build yet');
    mark('running the AI model');
    const answer = await runner.runModel(path, floatsToBase64(tensor));
    const [, tokens, width] = answer.dims;
    return poolTokens(base64ToFloats(answer.data), tokens, width);
  },
};
