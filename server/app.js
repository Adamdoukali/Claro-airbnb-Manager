import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { config } from './config.js';
import { initDB, refreshDB } from './database.js';
import { initStorage } from './storage.js';
import { attachUser, ensureAdminUser, requireAuth } from './auth.js';
import { errorHandler } from './middleware.js';
import { asyncHandler } from './utils.js';

import authRoutes from './routes/auth.js';
import propertiesRoutes from './routes/properties.js';
import settingsRoutes from './routes/settings.js';
import { bookingsRouter, calendarRouter, publicCalendarRouter } from './routes/bookings.js';
import { guestPoliceRouter, hostPoliceRouter } from './routes/police.js';
import { webhookRouter, hostHospitableRouter } from './routes/hospitable.js';
import automationRoutes from './routes/automation.js';
import dashboardRoutes from './routes/dashboard.js';
import { hostTasksRouter, publicTasksRouter } from './routes/tasks.js';
import issuesRoutes from './routes/issues.js';
import usersRoutes from './routes/users.js';
import { CLEANER_ALLOWED, requireRole } from './features.js';

/**
 * Build the Express app. Used by server/index.js (long-running process) and
 * api/index.js (Vercel serverless function).
 */
export async function createApp({ serveClient = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Vercel / Render / Railway sit behind a proxy

  // Content Security Policy: scripts only from this origin (the Vite bundle has no inline script);
  // inline styles are allowed because React style props are inline. Same policy as vercel.json for the CDN.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null
      }
    },
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
    limit: '6mb', // signatures are small PNGs; ID scans go through multer (15 MB cap)
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

  // A cleaner account only ever reaches its tasks and its own session.
  app.use('/api', (req, res, next) => {
    if (req.user?.role === 'cleaner' && !CLEANER_ALLOWED.some(rx => rx.test(req.originalUrl.split('?')[0]))) {
      return res.status(403).json({ error: 'Accès réservé : compte de ménage limité aux tâches' });
    }
    next();
  });

  // Public / guest routes (rate limited inside the routers)
  app.use('/api/auth', authRoutes);
  app.use('/api/police', guestPoliceRouter);
  app.use('/api/calendar', publicCalendarRouter);
  app.use('/api/integrations/hospitable', webhookRouter);
  app.use('/api/tasks', publicTasksRouter); // cleaner page by token (feature-gated)

  // Host routes (session required inside each router)
  app.use('/api/properties', propertiesRoutes);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/police', hostPoliceRouter);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/integrations/hospitable', requireAuth, requireRole('admin'), hostHospitableRouter);
  app.use('/api/automation', automationRoutes); // session or CRON_SECRET (checked inside)
  app.use('/api/dashboard', dashboardRoutes);   // beta: today view, metrics
  app.use('/api/tasks', hostTasksRouter);       // beta: cleaning tasks
  app.use('/api/issues', issuesRoutes);         // beta: guest issues
  app.use('/api/users', usersRoutes);           // beta: multi-user

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
