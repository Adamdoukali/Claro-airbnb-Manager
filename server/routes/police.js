import { Router } from 'express';
import { readDB, writeDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { generatePolicePdf } from '../pdfService.js';
import { scanDocumentWithOCR } from '../ocrService.js';
import { sendHospitableMessage, getActiveHospitableApiKey } from '../hospitableService.js';
import { generateFullAutomatedMessage } from '../messages.js';
import { upsertRegistration, deleteRegistrationFiles } from '../registrationService.js';
import { saveFile, readFile, isValidKey } from '../storage.js';
import { guestLimiter, ocrLimiter, imageUpload } from '../middleware.js';
import { asyncHandler, getBaseUrl, newId, portalUrl, str } from '../utils.js';

/** Routes used by guests (no session), rate limited. Mounted before the host router. */
export const guestPoliceRouter = Router();
/** Routes used by the host dashboard (session required). */
export const hostPoliceRouter = Router();

const LANGS = new Set(['fr', 'en', 'bilingual']);
const cleanCode = code => String(code || '').trim().toUpperCase().slice(0, 12);

function findByCode(db, code) {
  const c = cleanCode(code);
  return c ? db.policeRegistrations.find(r => String(r.accessCode).toUpperCase() === c) : null;
}

// ---------------------------------------------------------------------------
// Guest portal
// ---------------------------------------------------------------------------

guestPoliceRouter.get('/verify/:code', guestLimiter, (req, res) => {
  const db = readDB();
  const reg = findByCode(db, req.params.code);
  if (!reg) return res.status(404).json({ error: 'Code de réservation invalide ou introuvable.' });
  if (reg.expiresAt && new Date(reg.expiresAt) < new Date() && reg.status !== 'completed') {
    return res.status(410).json({ error: 'Ce code a expiré. Contactez votre hôte pour un nouveau lien.' });
  }

  const property = db.properties.find(p => p.id === reg.propertyId);
  const booking = reg.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : null;

  res.json({
    id: reg.id,
    accessCode: reg.accessCode,
    status: reg.status,
    guestName: reg.guestName,
    property: {
      name: property?.name || 'Hébergement touristique',
      city: property?.city || 'Maroc',
      address: property?.address || ''
    },
    // Partner recommendation for the final page (car rental). Only public fields.
    offer: db.settings.guestOffer?.enabled ? {
      title: db.settings.guestOffer.title,
      agencyName: db.settings.guestOffer.agencyName,
      description: db.settings.guestOffer.description,
      mapsUrl: db.settings.guestOffer.mapsUrl,
      phone: db.settings.guestOffer.phone,
      whatsapp: db.settings.guestOffer.whatsapp
    } : null,
    booking: booking ? { checkIn: booking.checkIn, checkOut: booking.checkOut } : null
  });
});

guestPoliceRouter.post('/ocr', ocrLimiter, imageUpload.single('idDocument'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun document fourni pour la numérisation' });

  const db = readDB();
  if (!findByCode(db, req.body?.code)) {
    return res.status(403).json({ error: "Code d'accès requis pour numériser un document" });
  }

  const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
  const key = await saveFile('uploads', `doc_${Date.now()}_${newId('f').slice(-6)}${ext}`, req.file.buffer, req.file.mimetype);

  let ocr = { success: false, documentType: 'unknown', data: {} };
  try {
    ocr = await scanDocumentWithOCR(req.file.buffer);
  } catch (err) {
    console.warn('[ocr] Échec de lecture, le document est conservé :', err.message);
  }

  res.json({ success: true, documentType: ocr.documentType, data: ocr.data, filePath: key });
}));

guestPoliceRouter.post('/submit', guestLimiter, imageUpload.single('idDocument'), asyncHandler(async (req, res) => {
  const db = readDB();
  const { code, guestData, signatureData } = req.body || {};
  const registration = findByCode(db, code);
  if (!registration) return res.status(404).json({ error: "Code d'enregistrement introuvable" });

  let parsed = {};
  try {
    parsed = typeof guestData === 'string' ? JSON.parse(guestData) : (guestData || {});
  } catch {
    return res.status(400).json({ error: 'Données voyageur invalides' });
  }

  const GUEST_FIELDS = ['fullName', 'firstName', 'lastName', 'idNumber', 'birthDate', 'birthPlace', 'nationality', 'idType', 'address', 'idDocumentPath'];
  const guests = (Array.isArray(parsed.guests) ? parsed.guests : [parsed]).slice(0, 10).map(g => {
    const out = {};
    for (const f of GUEST_FIELDS) if (g[f] !== undefined) out[f] = str(g[f], 200);
    if (out.idDocumentPath && !isValidKey(out.idDocumentPath)) delete out.idDocumentPath;
    return out;
  });
  if (!guests.length || !guests[0].lastName && !guests[0].fullName) {
    return res.status(400).json({ error: 'Le nom du voyageur principal est requis' });
  }

  const cs = parsed.commonStay || {};
  const commonStay = {
    arrivalDate: str(cs.arrivalDate, 10),
    departureDate: str(cs.departureDate, 10),
    comingFrom: str(cs.comingFrom, 120),
    goingTo: str(cs.goingTo, 120),
    apartmentNumber: str(cs.apartmentNumber, 60),
    address: str(cs.address, 200)
  };

  if (req.file) {
    const ext = req.file.mimetype === 'image/png' ? '.png' : '.jpg';
    guests[0].idDocumentPath = await saveFile('uploads', `doc_${Date.now()}${ext}`, req.file.buffer, req.file.mimetype);
  }

  if (typeof signatureData === 'string' && signatureData.startsWith('data:image/png;base64,')) {
    const buf = Buffer.from(signatureData.slice('data:image/png;base64,'.length), 'base64');
    if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Signature trop volumineuse' });
    registration.signaturePath = await saveFile('uploads', `sig_${registration.accessCode}_${Date.now()}.png`, buf, 'image/png');
  }
  if (!registration.signaturePath) {
    return res.status(400).json({ error: 'La signature est obligatoire' });
  }

  const primary = guests[0];
  const leadName = `${primary.lastName || ''} ${primary.firstName || ''}`.trim() || primary.fullName || registration.guestName;
  registration.guestDetails = { guests, totalGuests: guests.length, commonStay };
  registration.guestName = guests.length > 1 ? `${leadName} (+${guests.length - 1} pers.)` : leadName;
  registration.idDocumentPath = primary.idDocumentPath || registration.idDocumentPath || null;
  registration.status = 'completed';
  registration.completedAt = new Date().toISOString();

  const property = db.properties.find(p => p.id === registration.propertyId) || {};
  const pdf = await generatePolicePdf(registration, property);
  registration.pdfPath = pdf.key;
  registration.pdfUrl = pdf.downloadUrl;

  await writeDB(db);
  // The generated document is for the host only: nothing about it is returned to the guest.
  res.json({
    success: true,
    message: 'Enregistrement terminé.',
    registration: { id: registration.id, status: registration.status }
  });
}));

/** PDF download: host session only (guests never receive the document). */
guestPoliceRouter.get('/download/:filename', guestLimiter, asyncHandler(async (req, res) => {
  const key = `pdfs/${req.params.filename}`;
  if (!isValidKey(key)) return res.status(400).send('Nom de fichier invalide');
  if (!req.user) return res.status(403).send('Accès refusé');

  const buffer = await readFile(key);
  if (!buffer) return res.status(404).send('PDF non trouvé');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.send(buffer);
}));

// ---------------------------------------------------------------------------
// Host dashboard
// ---------------------------------------------------------------------------
hostPoliceRouter.use(requireAuth);

hostPoliceRouter.get('/registrations', (req, res) => {
  const db = readDB();
  const { propertyId } = req.query;
  const list = propertyId ? db.policeRegistrations.filter(r => r.propertyId === propertyId) : db.policeRegistrations;
  res.json([...list].reverse()); // most recent first, without mutating the store
});

hostPoliceRouter.post('/codes', asyncHandler(async (req, res) => {
  const db = readDB();
  const { propertyId, guestName, bookingId, guestPhone } = req.body || {};
  const language = LANGS.has(req.body?.language) ? req.body.language : (db.settings.defaultLanguage || 'fr');

  const property = db.properties.find(p => p.id === propertyId);
  if (!property) return res.status(404).json({ error: 'Logement introuvable' });
  const booking = bookingId ? db.bookings.find(b => b.id === bookingId && b.propertyId === property.id) : null;

  const { reg, portalUrl: link } = upsertRegistration({
    db, property, booking,
    guestName: str(guestName, 120),
    guestPhone: str(guestPhone, 40),
    language,
    baseUrl: getBaseUrl(req)
  });

  await writeDB(db);
  res.status(201).json({ ...reg, portalUrl: link });
}));

hostPoliceRouter.post('/message/preview', (req, res) => {
  const db = readDB();
  const { registrationId, bookingId, propertyId } = req.body || {};
  const language = LANGS.has(req.body?.language) ? req.body.language : 'fr';

  const reg = registrationId ? db.policeRegistrations.find(r => r.id === registrationId) : null;
  const property = db.properties.find(p => p.id === (reg?.propertyId || propertyId));
  const booking = db.bookings.find(b => b.id === (reg?.bookingId || bookingId)) || null;
  const code = reg?.accessCode || 'XXXXXX';
  const link = portalUrl(getBaseUrl(req), code);

  const message = generateFullAutomatedMessage({
    guestName: str(req.body?.guestName, 120) || reg?.guestName || booking?.guestName || 'Cher voyageur',
    propertyName: property?.name,
    city: property?.city,
    accessCode: code,
    portalUrl: link,
    hostName: property?.hostName,
    checkIn: booking?.checkIn,
    checkOut: booking?.checkOut,
    language
  });
  res.json({ message, accessCode: code, portalUrl: link });
});

hostPoliceRouter.post('/message/send', asyncHandler(async (req, res) => {
  const db = readDB();
  const { registrationId, messageText, channel = 'hospitable' } = req.body || {};
  const reg = db.policeRegistrations.find(r => r.id === registrationId);
  if (!reg) return res.status(404).json({ error: "Fiche d'enregistrement introuvable" });

  const booking = reg.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : null;
  const finalMsg = str(messageText, 5000) || reg.automatedMessage;

  if (channel === 'hospitable') {
    const token = getActiveHospitableApiKey();
    if (!token) return res.status(400).json({ error: 'Clé API Hospitable non configurée (menu Hospitable).' });
    const reservationId = reg.hospitableReservationId || booking?.hospitableReservationId;
    if (!reservationId) {
      return res.status(400).json({ error: "Cette réservation n'est pas liée à Hospitable. Utilisez WhatsApp ou copiez le message." });
    }
    await sendHospitableMessage(token, reservationId, finalMsg);
  }

  reg.messageSentAt = new Date().toISOString();
  reg.messageChannel = channel === 'hospitable' ? 'hospitable' : 'whatsapp';
  reg.automatedMessage = finalMsg;
  await writeDB(db);
  res.json({ success: true, messageSentAt: reg.messageSentAt, channel: reg.messageChannel });
}));

hostPoliceRouter.get('/pdf/:id', asyncHandler(async (req, res) => {
  const db = readDB();
  const reg = db.policeRegistrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Fiche introuvable' });
  if (reg.status !== 'completed') return res.status(400).json({ error: "Le voyageur n'a pas encore rempli sa fiche" });

  const property = db.properties.find(p => p.id === reg.propertyId) || {};
  const pdf = await generatePolicePdf(reg, property);
  reg.pdfPath = pdf.key;
  reg.pdfUrl = pdf.downloadUrl;
  await writeDB(db);

  const buffer = await readFile(pdf.key);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${pdf.fileName}"`);
  res.send(buffer);
}));

hostPoliceRouter.delete('/registrations/:id', asyncHandler(async (req, res) => {
  const db = readDB();
  const idx = db.policeRegistrations.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Fiche introuvable' });
  const [removed] = db.policeRegistrations.splice(idx, 1);
  await writeDB(db);
  await deleteRegistrationFiles(removed);
  res.json({ success: true, removed: removed.id });
}));
