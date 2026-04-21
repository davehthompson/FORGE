import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { enrichRouter } from './routes/enrich.js';
import { generateRouter } from './routes/generate.js';
import { exportRouter } from './routes/export.js';
import { analyticsRouter } from './routes/analytics.js';
import { v1Router } from './routes/v1.js';
import { apiKeyAuth } from './middleware/apiKey.js';

// Load .env file in development (dotenv may be excluded in production deploys)
try { require('dotenv').config(); } catch { /* dotenv not available */ }

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/enrich', enrichRouter);
app.use('/api/generate', generateRouter);
app.use('/api/export', exportRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/v1', apiKeyAuth, v1Router);

// Serve static frontend files
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA catch-all: serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

export default app;

app.listen(PORT, () => {
  console.log(`FORGE server running on port ${PORT}`);
});
