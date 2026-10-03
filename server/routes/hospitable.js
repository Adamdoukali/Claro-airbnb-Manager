import { Router } from 'express';
import { readDB, writeDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import {
  testHospitableConnection,
  syncPropertiesFromHospitable,
  syncHospitableReservations,
  sendHospitableMessage,
  handleHospitableWebhook,
  verifyWebhookSignature,
  getActiveHospitableApiKey
} from '../hospitableService.js';
import { webhookLimiter } from '../middleware.js';
import { asyncHandler, getBaseUrl, str } from '../utils.js';

/** Incoming webhook from Hospitable (no session; HMAC signature when a secret is configured). */
export const webhookRouter = Router();
/** Host-only integration actions. */
export const hostHospitableRouter = Router();

webhookRouter.post('/webhook', webhookLimiter, asyncHandler(async (req, res) => {
  const signature = req.get('signature') || req.get('x-hospitable-signature') || req.get('x-signature');
  if (config.hospitableWebhookSecret && !verifyWebhookSignature(req.rawBody, signature, config.hospitableWebhookSecret)) {
    return res.status(401).json({ error: 'Signature du webhook invalide' });
  }
  if (!config.hospitableWebhookSecret) {
    if (config.isProd) {
      // Without a shared secret anyone could inject fake reservations: refuse until it is configured.
      console.warn('[webhook] HOSPITABLE_WEBHOOK_SECRET absent : webhook refusé en production.');
      return res.status(503).json({ error: 'Webhook non configuré : définissez HOSPITABLE_WEBHOOK_SECRET.' });
    }
    console.warn('[webhook] HOSPITABLE_WEBHOOK_SECRET absent : signature non vérifiée (développement).');
  }
  const result = await handleHospitableWebhook(req.body, getBaseUrl(req));
  // Hospitable retries on non-2xx: always acknowledge a well-formed delivery.
  res.json(result);
}));

hostHospitableRouter.use(requireAuth);

hostHospitableRouter.post('/test', asyncHandler(async (req, res) => {
  res.json(await testHospitableConnection(str(req.body?.apiKey, 500)));
}));

hostHospitableRouter.post('/sync-properties', asyncHandler(async (req, res) => {
  res.json(await syncPropertiesFromHospitable(str(req.body?.apiKey, 500)));
}));

hostHospitableRouter.post('/sync', asyncHandler(async (req, res) => {
  res.json(await syncHospitableReservations({
    apiKey: str(req.body?.apiKey, 500),
    propertyId: req.body?.propertyId || null,
    baseUrl: getBaseUrl(req)
  }));
}));

hostHospitableRouter.post('/sync-all', asyncHandler(async (req, res) => {
  const apiKey = str(req.body?.apiKey, 500);
  const properties = await syncPropertiesFromHospitable(apiKey);
  const reservations = await syncHospitableReservations({ apiKey, baseUrl: getBaseUrl(req) });
  res.json({ success: true, properties, reservations });
}));

hostHospitableRouter.post('/send-police-message', asyncHandler(async (req, res) => {
  const db = readDB();
  const reg = db.policeRegistrations.find(r => r.id === req.body?.registrationId);
  if (!reg) return res.status(404).json({ error: "Fiche d'enregistrement non trouvée" });

  const booking = db.bookings.find(b => b.id === reg.bookingId);
  const reservationId = reg.hospitableReservationId || booking?.hospitableReservationId;
  if (!reservationId) return res.status(400).json({ error: "Cette réservation n'a pas d'identifiant Hospitable associé." });

  const token = getActiveHospitableApiKey();
  if (!token) return res.status(400).json({ error: 'Clé API Hospitable requise (menu Hospitable).' });

  const result = await sendHospitableMessage(token, reservationId, reg.automatedMessage);
  reg.messageSentAt = new Date().toISOString();
  reg.messageChannel = 'hospitable';
  await writeDB(db);
  res.json({ success: true, message: 'Message envoyé au voyageur via Hospitable.', sentAt: reg.messageSentAt, result });
}));
