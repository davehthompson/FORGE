// Side-effect-only module: loads `.env` into `process.env` BEFORE any other
// server module is imported. Must be the first import in `index.ts`.
//
// ES module imports are evaluated top-down, but every import in a file is
// resolved before any of that file's runtime code runs. That means calling
// `dotenv.config()` *inside* `index.ts` happens too late — the service
// modules transitively imported above it have already captured `undefined`
// for things like `LOGO_DEV_KEY` and `ANTHROPIC_API_KEY` at the top of
// their own module bodies.
//
// By isolating `dotenv.config()` in this module and importing it first, we
// guarantee it runs before any subsequent module body executes.
import dotenv from 'dotenv';

dotenv.config();
