import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { enrichRouter } from './routes/enrich.js';
import { generateRouter } from './routes/generate.js';
import { exportRouter } from './routes/export.js';
import { analyticsRouter } from './routes/analytics.js';
import { v1Router } from './routes/v1.js';
import { apiKeyAuth } from './middleware/apiKey.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/enrich', enrichRouter);
app.use('/api/generate', generateRouter);
app.use('/api/export', exportRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/v1', apiKeyAuth, v1Router);

// Serve the built React client (Ramplify single-app deploy).
// Skipped on Vercel — Vercel serves /client/dist via its own static layer.
if (!process.env.VERCEL) {
  // dist layout: <root>/server/dist/index.js -> <root>/client/dist
  const clientDist = path.resolve(__dirname, '../../client/dist');

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));

    // SPA fallback: any non-/api GET returns index.html so React Router can handle it.
    app.get(/^\/(?!api\/).*/, (_req, res, next) => {
      const indexFile = path.join(clientDist, 'index.html');
      if (!existsSync(indexFile)) return next();
      res.sendFile(indexFile);
    });
  } else {
    console.warn(`⚠️  client/dist not found at ${clientDist} — static serving disabled.`);
  }
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🔨 FORGE server running on port ${PORT}`);
  });
}
