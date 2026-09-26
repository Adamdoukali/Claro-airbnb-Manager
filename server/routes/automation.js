import crypto from 'crypto';
import { Router } from 'express';
import { getSettings } from '../database.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { runAutomation } from '../automationRunner.js';
import { asyncHandler, getBaseUrl } from '../utils.js';
import { requireRole, isFeatureOn } from '../features.js';
import { ensureCleaningTasks } from './tasks.js';
import { readDB, writeDB } from '../database.js';

const router = Router();

/** Scheduler (Vercel Cron) authenticates with `Authorization: Bearer CRON_SECRET`; hosts with their session. */
function cronOrSession(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (config.cronSecret && token) {
    const a = Buffer.from(token);
    const b = Buffer.from(config.cronSecret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      req.cron = true;
      return next();
    }
  }
  return requireAuth(req, res, next);
}

const runHandler = asyncHandler(async (req, res) => {
  if (isFeatureOn('tasks')) {
    const db = readDB();
    const r = ensureCleaningTasks(db);
    if (r.created || r.removed) await writeDB(db);
  }
  const report = await runAutomation({
    baseUrl: getBaseUrl(req),
    trigger: req.cron ? 'cron' : 'manual'
  });
  res.json({ success: true, report });
});

router.get('/run', cronOrSession, runHandler);   // Vercel Cron calls with GET
router.post('/run', cronOrSession, runHandler);

router.post('/preview', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const report = await runAutomation({ baseUrl: getBaseUrl(req), trigger: 'preview', dryRun: true });
  res.json({ success: true, report });
}));

router.get('/status', requireAuth, (_req, res) => {
  const settings = getSettings();
  const a = settings.automation || {};
  res.json({
    scheduler: config.isServerless
      ? (config.cronSecret ? 'vercel-cron' : 'none')
      : (config.automationIntervalMinutes > 0 ? 'interval' : 'none'),
    intervalMinutes: config.isServerless ? 1 : config.automationIntervalMinutes,
    cronSecretConfigured: Boolean(config.cronSecret),
    webhookSecretConfigured: Boolean(config.hospitableWebhookSecret),
    lastWebhookAt: settings.lastWebhookAt || null,
    lastSyncAt: settings.lastGlobalSync || null,
    autoSyncEnabled: Boolean(a.autoSyncEnabled),
    lastRunAt: a.lastRunAt || null,
    lastRunReport: a.lastRunReport || null
  });
});

export default router;
