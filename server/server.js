/* =====================================================================
   STARTING THE SERVER
   First makes sure the signing secret (JWT_SECRET) is safe to use, and
   refuses to start if it is missing, short or a placeholder (see
   utils/secretCheck.js). Then connects to the database and starts
   listening for requests.
   Run it with: npm start
   ===================================================================== */

import app, { config } from './app.js';
import { connectDB } from './config/db.js';
import { requireGoodSecret } from './utils/secretCheck.js';

// (app.js above has already read the settings from .env, so the secret is there to check)
requireGoodSecret();

await connectDB();

app.listen(config.port, () => {
  console.log(`WUBRG'r server listening on port ${config.port}`);
});
