import { Router } from 'express';
import { readDB, writeDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { syncPropertyFeeds, generatePropertyIcal } from '../icalService.js';
import { getActiveHospitableApiKey, syncHospitableReservations } from '../hospitableService.js';
import { upsertRegistration } from '../registrationService.js';
import { asyncHandler, datesOverlap, getBaseUrl, isIsoDate, newId, str } from '../utils.js';

export const bookingsRouter = Router();
export const calendarRouter = Router();
export const publicCalendarRouter = Router();

bookingsRouter.use(requireAuth);
calendarRouter.use(requireAuth);

const SOURCES = new Set(['direct', 'blocked', 'airbnb', 'booking', 'vrbo']);

bookingsRouter.get('/', (req, res) => {
  const db = readDB();
  const { propertyId } = req.query;
  const list = propertyId ? db.bookings.filter(b => b.propertyId === propertyId) : db.bookings;
  res.json(list);
});

bookingsRouter.post('/', asyncHandler(async (req, res) => {
  const db = readDB();
  const body = req.body || {};
  const propertyId = str(body.propertyId, 100);
  const checkIn = str(body.checkIn, 10);
  const checkOut = str(body.checkOut, 10);
  const source = SOURCES.has(body.source) ? body.source : 'direct';

  if (!propertyId || !isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return res.status(400).json({ error: 'Logement, date d\'arrivée et date de départ (AAAA-MM-JJ) sont requis' });
  }
  if (checkOut <= checkIn) {
    return res.status(400).json({ error: 'La date de départ doit être après la date d\'arrivée' });
  }
  const property = db.properties.find(p => p.id === propertyId);
  if (!property) return res.status(404).json({ error: 'Logement introuvable' });

  // Double-booking guard: refuse dates that overlap an active booking of the same property.
  const conflict = db.bookings.find(b =>
    b.propertyId === propertyId &&
    b.status !== 'cancelled' &&
    datesOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
  );
  if (conflict && !body.force) {
    return res.status(409).json({
      error: `Ces dates chevauchent une réservation existante (${conflict.guestName || conflict.source}, du ${conflict.checkIn} au ${conflict.checkOut}).`,
      conflict: { id: conflict.id, guestName: conflict.guestName, checkIn: conflict.checkIn, checkOut: conflict.checkOut }
    });
  }

  const guestName = str(body.guestName, 120);
  const booking = {
    id: newId('bkg'),
    propertyId,
    source,
    channel: source,
    guestName: guestName || (source === 'blocked' ? 'Dates bloquées' : 'Client direct'),
    guestEmail: str(body.guestEmail, 200),
    guestPhone: str(body.guestPhone, 40),
    checkIn,
    checkOut,
    status: source === 'blocked' ? 'blocked' : 'confirmed',
    totalPrice: Number.isFinite(Number(body.totalPrice)) && body.totalPrice !== '' && body.totalPrice !== null ? Number(body.totalPrice) : null,
    currency: 'MAD',
    notes: str(body.notes, 2000),
    externalUid: null,
    createdAt: new Date().toISOString()
  };
  db.bookings.push(booking);

  let registration = null;
  if (source !== 'blocked') {
    registration = upsertRegistration({
      db, property, booking,
      guestName: booking.guestName,
      guestPhone: booking.guestPhone,
      language: db.settings.defaultLanguage || 'fr',
      baseUrl: getBaseUrl(req)
    }).reg;
  }

  await writeDB(db);
  res.status(201).json({ ...booking, registration });
}));

bookingsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const db = readDB();
  const idx = db.bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Réservation introuvable' });

  const [deleted] = db.bookings.splice(idx, 1);
  // Pending police forms attached to it become pointless; completed ones are kept as records.
  db.policeRegistrations = db.policeRegistrations.filter(r => !(r.bookingId === deleted.id && r.status !== 'completed'));
  await writeDB(db);
  res.json(deleted);
}));

// ---- Calendar sync ----------------------------------------------------------

calendarRouter.post('/sync', asyncHandler(async (req, res) => {
  const { propertyId } = req.body || {};
  const db = readDB();
  const property = propertyId ? db.properties.find(p => p.id === propertyId) : null;

  if (property?.hospitableId && getActiveHospitableApiKey()) {
    const result = await syncHospitableReservations({ propertyId, baseUrl: getBaseUrl(req) });
    return res.json({ success: true, source: 'hospitable', ...result });
  }
  if (property) {
    const result = await syncPropertyFeeds(propertyId);
    return res.json({ success: true, source: 'ical', ...result });
  }
  if (getActiveHospitableApiKey()) {
    const result = await syncHospitableReservations({ baseUrl: getBaseUrl(req) });
    return res.json({ success: true, source: 'hospitable', ...result });
  }
  res.status(400).json({ error: 'Logement introuvable ou aucune source de synchronisation configurée.' });
}));

calendarRouter.get('/logs', (req, res) => {
  res.json(readDB().syncLogs || []);
});

// ---- Public iCal export (consumed by Airbnb / Booking.com, protected by a per-property token) ----

publicCalendarRouter.get('/export/:propertyId.ics', (req, res) => {
  const db = readDB();
  const property = db.properties.find(p => p.id === req.params.propertyId);
  if (!property) return res.status(404).send('Not found');

  const token = String(req.query.token || '');
  if (!property.icalToken || token !== property.icalToken) {
    return res.status(403).send('Invalid calendar token');
  }
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="calendar_${property.id}.ics"`);
  res.send(generatePropertyIcal(property.id));
});
