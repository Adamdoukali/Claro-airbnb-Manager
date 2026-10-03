import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getSettings, updateSettings, readDB, writeDB, DEFAULT_GUEST_OFFER } from '../database.js';
import { MESSAGE_PLACEHOLDERS, defaultMessageTemplates, renderTemplate, generateFullAutomatedMessage, generateReminderMessage } from '../messages.js';
import { refreshPendingMessages } from '../registrationService.js';
import { getBaseUrl } from '../utils.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { checkPdfEngine } from '../pdfService.js';
import { AUTO_MESSAGE_TIMINGS, clampInt, normalizeAutomation } from '../automation.js';
import { FEATURE_KEYS, getFeatures, requireRole } from '../features.js';
import { asyncHandler, str } from '../utils.js';

const router = Router();
router.use(requireAuth);

const LANGS = new Set(['fr', 'en', 'bilingual']);
const AGENCY_FIELDS = ['agencyName', 'agencyAddress', 'agencySubAddress', 'agencyCity', 'agencyPhone', 'agencyIce'];

/** Never return the Hospitable token itself, only whether one is stored. */
export function publicSettings(settings) {
  const { hospitableApiKey, security, ...rest } = settings;
  const key = hospitableApiKey || '';
  return {
    ...rest,
    hasKey: Boolean(key),
    maskedKey: key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : (key ? '••••••••' : '')
  };
}

router.get('/', requireRole('admin', 'assistant'), (req, res) => {
  res.json(publicSettings(getSettings()));
});

/** Host-only health report: storage mode, PDF engine, OCR language data. */
router.get('/diagnostics', requireRole('admin'), asyncHandler(async (_req, res) => {
  const pdf = await checkPdfEngine();
  res.json({
    storage: config.useSupabase ? 'supabase' : 'local',
    serverless: config.isServerless,
    node: process.version,
    ocrLanguageData: ['eng', 'fra'].map(l => ({ lang: l, present: fs.existsSync(path.join(config.serverDir, `${l}.traineddata`)) })),
    pdf
  });
}));

/** Built-in message texts (with placeholder names) + the placeholder list, for the editor. */
router.get('/message-defaults', requireRole('admin'), (_req, res) => {
  res.json({ defaults: defaultMessageTemplates(), placeholders: MESSAGE_PLACEHOLDERS });
});

const SAMPLE = { guestName: 'Sara Benali', propertyName: 'Naya - Elegant Modern /Pool', city: 'Tanger', accessCode: '482913', hostName: 'Claro Conciergerie', checkIn: '2026-11-03', checkOut: '2026-11-07' };

/** Render a template with sample data without saving it. */
router.post('/message-preview', requireRole('admin'), (req, res) => {
  const template = str(req.body?.template, 5000);
  const kind = req.body?.kind === 'reminder' ? 'reminder' : 'checkin';
  const language = req.body?.language === 'en' ? 'en' : 'fr';
  const portal = `${getBaseUrl(req)}/?guestCode=${SAMPLE.accessCode}`;
  const base = { ...SAMPLE, portalUrl: portal, language, __ignoreCustom: true };
  if (!template) {
    return res.json({ message: kind === 'reminder' ? generateReminderMessage(base) : generateFullAutomatedMessage(base) });
  }
  const vars = {
    first_name: 'Sara', guest_name: SAMPLE.guestName, property_name: SAMPLE.propertyName, city: SAMPLE.city,
    check_in: language === 'en' ? SAMPLE.checkIn : '03/11/2026', check_out: language === 'en' ? SAMPLE.checkOut : '07/11/2026',
    portal_url: portal, access_code: SAMPLE.accessCode, host_name: SAMPLE.hostName,
    link_label: language === 'en' ? 'Check-in form' : 'Formulaire de check-in',
    code_label: language === 'en' ? 'Your access code' : "Votre code d'accès"
  };
  res.json({ message: renderTemplate(template, vars) });
});

router.put('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const patch = {};
  let templatesChanged = false;

  // Editable guest message templates (empty string = built-in text)
  if (body.messageTemplates && typeof body.messageTemplates === 'object') {
    const cur = getSettings().messageTemplates || {};
    const next = { ...cur };
    for (const k of ['fr', 'en', 'reminderFr', 'reminderEn']) {
      if (body.messageTemplates[k] !== undefined) next[k] = str(body.messageTemplates[k], 5000);
    }
    templatesChanged = JSON.stringify(next) !== JSON.stringify(cur);
    patch.messageTemplates = next;
  }

  // Beta feature switches (all off by default). Only known keys, only booleans.
  if (body.features && typeof body.features === 'object') {
    const next = { ...getFeatures() };
    for (const k of FEATURE_KEYS) if (body.features[k] !== undefined) next[k] = Boolean(body.features[k]);
    patch.features = next;
  }

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

  const languageChanged = patch.defaultLanguage !== undefined && patch.defaultLanguage !== getSettings().defaultLanguage;
  const updated = await updateSettings(patch);

  // Pending guests must receive the new wording: re-render their stored messages now.
  let refreshed = 0;
  if (templatesChanged || languageChanged) {
    const db = readDB();
    refreshed = refreshPendingMessages(db, getBaseUrl(req));
    await writeDB(db);
  }
  res.json({ success: true, settings: publicSettings(updated), refreshedMessages: refreshed });
}));

export default router;
