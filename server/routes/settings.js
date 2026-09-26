import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getSettings, updateSettings, readDB, DEFAULT_GUEST_OFFER } from '../database.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { checkPdfEngine } from '../pdfService.js';
import { AUTO_MESSAGE_TIMINGS, clampInt, normalizeAutomation } from '../automation.js';
import { asyncHandler, str } from '../utils.js';

const router = Router();
router.use(requireAuth);

const LANGS = new Set(['fr', 'en', 'bilingual']);
const AGENCY_FIELDS = ['agencyName', 'agencyAddress', 'agencySubAddress', 'agencyCity', 'agencyPhone', 'agencyIce'];

/** Never return the Hospitable token itself, only whether one is stored. */
export function publicSettings(settings) {
  const { hospitableApiKey, ...rest } = settings;
  const key = hospitableApiKey || '';
  return {
    ...rest,
    hasKey: Boolean(key),
    maskedKey: key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : (key ? '••••••••' : '')
  };
}

router.get('/', (req, res) => {
  res.json(publicSettings(getSettings()));
});

/** Host-only health report: storage mode, PDF engine, OCR language data. */
router.get('/diagnostics', asyncHandler(async (_req, res) => {
  const pdf = await checkPdfEngine();
  res.json({
    storage: config.useSupabase ? 'supabase' : 'local',
    serverless: config.isServerless,
    node: process.version,
    ocrLanguageData: ['eng', 'fra'].map(l => ({ lang: l, present: fs.existsSync(path.join(config.serverDir, `${l}.traineddata`)) })),
    pdf
  });
}));

router.put('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const patch = {};

  if (body.hospitableApiKey !== undefined) {
    patch.hospitableApiKey = str(body.hospitableApiKey, 500);
    if (!patch.hospitableApiKey) patch.hospitableConnected = false;
  }
  if (body.defaultLanguage !== undefined && LANGS.has(body.defaultLanguage)) patch.defaultLanguage = body.defaultLanguage;
  for (const f of AGENCY_FIELDS) {
    if (body[f] !== undefined) patch[f] = str(body[f], 200);
  }

  if (body.guestOffer && typeof body.guestOffer === 'object') {
    const o = body.guestOffer;
    const next = { ...DEFAULT_GUEST_OFFER, ...(getSettings().guestOffer || {}) };
    if (o.enabled !== undefined) next.enabled = Boolean(o.enabled);
    for (const [f, max] of [['title', 120], ['agencyName', 120], ['description', 600], ['phone', 40], ['whatsapp', 40]]) {
      if (o[f] !== undefined) next[f] = str(o[f], max);
    }
    if (o.mapsUrl !== undefined) {
      const url = str(o.mapsUrl, 500);
      next.mapsUrl = /^https:\/\//i.test(url) ? url : '';
    }
    patch.guestOffer = next;
  }

  if (body.automation && typeof body.automation === 'object') {
    const current = normalizeAutomation(getSettings().automation);
    const a = body.automation;
    const next = { ...current };

    for (const flag of ['autoMessageEnabled', 'autoMessageIncludeExisting', 'reminderEnabled', 'autoSyncEnabled']) {
      if (a[flag] !== undefined) next[flag] = Boolean(a[flag]);
    }
    if (Array.isArray(a.autoMessagePropertyIds)) {
      const known = new Set(readDB().properties.map(p => p.id));
      next.autoMessagePropertyIds = [...new Set(a.autoMessagePropertyIds.map(String).filter(id => known.has(id)))];
    }
    if (a.autoMessageTiming !== undefined && AUTO_MESSAGE_TIMINGS.has(a.autoMessageTiming)) next.autoMessageTiming = a.autoMessageTiming;
    if (a.autoMessageDaysBefore !== undefined) next.autoMessageDaysBefore = clampInt(a.autoMessageDaysBefore, 0, 30, current.autoMessageDaysBefore);
    if (a.reminderDaysBefore !== undefined) next.reminderDaysBefore = clampInt(a.reminderDaysBefore, 0, 14, current.reminderDaysBefore);

    // Remember when messaging was switched on: bookings imported before that stay untouched
    // unless "include existing" is explicitly ticked.
    if (!current.autoMessageEnabled && next.autoMessageEnabled) next.autoMessageActivatedAt = new Date().toISOString();

    patch.automation = next;
  }

  const updated = await updateSettings(patch);
  res.json({ success: true, settings: publicSettings(updated) });
}));

export default router;
