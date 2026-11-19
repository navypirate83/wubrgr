/* =====================================================================
   THE AI MODEL: ANDROID (a stand-in for now)
   Running the AI model on a phone needs a native add-on, which means a new
   Android build, so it has not been added yet. This stand-in says so, and
   the scanner (and the options sheet, which hides the AI switch) carries on
   exactly as it did before. The website's real one is aiModel.web.ts.
   ===================================================================== */

import type { AiModel } from './aiModel';

export const aiModel: AiModel = {
  available: false,
  embed: async () => { throw new Error('The AI model is not in this build yet'); },
};
