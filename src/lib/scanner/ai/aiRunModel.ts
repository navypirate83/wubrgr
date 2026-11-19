/* =====================================================================
   RUNNING THE MODEL ONCE (plain TypeScript, works with any ONNX runtime)
   "ONNX runtime" is the program that actually runs the AI model file. The
   website uses onnxruntime-web; the test scripts use onnxruntime-node. Both
   work the same way, so this small piece (one picture's numbers in, one
   768-number fingerprint out) is written once, here, against the little
   shape they share, and is used by aiModel.web.ts and by the tests.
   ===================================================================== */

import { MODEL_SIZE, poolTokens } from '../core/modelInput.ts';

// The parts of an ONNX runtime that are used here
export type OrtLike = {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
};
export type OrtSession = {
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number>; dims: readonly number[] }>>;
};

// The name of the model's input, and of the answer we read
const INPUT_NAME = 'pixel_values';
const OUTPUT_NAME = 'last_hidden_state';

// Run the model on one picture's numbers (3 x 224 x 224 decimals) and give back the 768-number fingerprint
export async function embedWith(ort: OrtLike, session: OrtSession, tensor: Float32Array): Promise<Float32Array> {
  const input = new ort.Tensor('float32', tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const result = await session.run({ [INPUT_NAME]: input });
  // The answer is called last_hidden_state; if this model file names it differently, use its first answer
  const out = result[OUTPUT_NAME] ?? result[session.outputNames[0]];
  const [, tokens, width] = out.dims;
  return poolTokens(out.data, tokens, width);
}
