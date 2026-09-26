import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { config } from './config.js';
import { initDB, refreshDB } from './database.js';
import { initStorage } from './storage.js';
import { attachUser, ensureAdminUser } from './auth.js';
import { errorHandler } from './middleware.js';
import { asyncHandler } from './utils.js';

import authRoutes from './routes/auth.js';
import propertiesRoutes from './routes/properties.js';
import settingsRoutes from './routes/settings.js';
import { bookingsRouter, calendarRouter, publicCalendarRouter } from './routes/bookings.js';
import { guestPoliceRouter, hostPoliceRouter } from './routes/police.js';
import { webhookRouter, hostHospitableRouter } from './routes/hospitable.js';
import automationRoutes from './routes/automation.js';

/**
 * Build the Express app. Used by server/index.js (long-running process) and
 * api/index.js (Vercel serverless function).
 */
export async function createApp({ serveClient = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Vercel / Render / Railway sit behind a proxy

  app.use(helmet({
    contentSecurityPolicy: false, // the Vite bundle uses inline styles; CSP is opt-in for now
    crossOriginEmbedderPolicy: false
  }));

  // Same-origin by default (the API serves the built client). Extra origins via CORS_ORIGINS.
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin) || (config.appUrl && origin === config.appUrl)) return cb(null, true);
      if (!config.isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true
  }));

  app.use(cookieParser());
  app.use(express.json({
    limit: '20mb',
    verify: (req, _res, buf) => { req.rawBody = buf; } // raw body kept for webhook signatures
  }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storage: config.useSupabase ? 'supabase' : 'local',
      serverless: config.isServerless,
      time: new Date().toISOString()
    });
  });

  // A serverless platform has no persistent disk: refuse to run without Supabase
  // instead of silently losing data.
  if (config.isServerless && !config.useSupabase) {
    app.all('/api/*', (_req, res) => res.status(503).json({
      error: 'Base de données non configurée : définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans les variables d\'environnement, puis redéployez.'
    }));
    app.use(errorHandler);
    return app;
  }

  await initDB();
  await initStorage();
  await ensureAdminUser();

  // Several serverless instances share the database: re-read it at the start of each request.
  if (config.useSupabase) {
    app.use('/api', asyncHandler(async (_req, _res, next) => { await refreshDB(); next(); }));
  }

  app.use('/api', attachUser);

  // Public / guest routes (rate limited inside the routers)
  app.use('/api/auth', authRoutes);
  app.use('/api/police', guestPoliceRouter);
  app.use('/api/calendar', publicCalendarRouter);
  app.use('/api/integrations/hospitable', webhookRouter);

  // Host routes (session required inside each router)
  app.use('/api/properties', propertiesRoutes);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/police', hostPoliceRouter);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/integrations/hospitable', hostHospitableRouter);
  app.use('/api/automation', automationRoutes); // session or CRON_SECRET (checked inside)

  app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Route introuvable' }));

  // Built React client (npm run build at the repo root). On Vercel the static files are
  // served by the CDN and this block is skipped.
  if (serveClient) {
    const clientDist = path.join(config.serverDir, '..', 'client', 'dist');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    } else {
      console.warn('[client] client/dist absent : lancez "npm run build" (ou "npm run client" en développement).');
    }
  }

  app.use(errorHandler);
  return app;
}
