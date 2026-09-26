import { Router } from 'express';
import { readDB, writeDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { deleteRegistrationFiles } from '../registrationService.js';
import { asyncHandler, newId, randomToken, str } from '../utils.js';
import { requireRole } from '../features.js';

const router = Router();
router.use(requireAuth);

const EDITABLE = [
  'name', 'type', 'city', 'address', 'airbnbUrl', 'airbnbIcalUrl', 'bookingIcalUrl',
  'policeLicenseNumber', 'hostName', 'hostPhone', 'policePrecinct', 'hospitableId'
];

function sanitize(body = {}) {
  const out = {};
  for (const f of EDITABLE) {
    if (body[f] !== undefined) out[f] = str(body[f], f.endsWith('Url') ? 1000 : 200);
  }
  return out;
}

router.get('/', asyncHandler(async (req, res) => {
  const db = readDB();
  let changed = false;
  for (const p of db.properties) {
    if (!p.icalToken) { p.icalToken = randomToken(12); changed = true; }
  }
  if (changed) await writeDB(db);
  res.json(db.properties);
}));

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const db = readDB();
  const data = sanitize(req.body);
  if (!data.name) return res.status(400).json({ error: 'Le nom du logement est requis' });

  const property = {
    id: newId('prop'),
    hospitableId: null,
    type: 'Appartement meublé',
    city: '',
    address: '',
    airbnbUrl: '',
    airbnbIcalUrl: '',
    bookingIcalUrl: '',
    policeLicenseNumber: '',
    hostName: '',
    hostPhone: '',
    policePrecinct: '',
    channels: [],
    ...data,
    icalToken: randomToken(12),
    lastSyncAt: null,
    createdAt: new Date().toISOString()
  };
  db.properties.push(property);
  await writeDB(db);
  res.status(201).json(property);
}));

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const db = readDB();
  const property = db.properties.find(p => p.id === req.params.id);
  if (!property) return res.status(404).json({ error: 'Logement introuvable' });

  Object.assign(property, sanitize(req.body), { updatedAt: new Date().toISOString() });
  if (!property.name) return res.status(400).json({ error: 'Le nom du logement est requis' });
  await writeDB(db);
  res.json(property);
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const db = readDB();
  const idx = db.properties.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Logement introuvable' });

  const [removed] = db.properties.splice(idx, 1);
  db.bookings = db.bookings.filter(b => b.propertyId !== removed.id);
  const removedRegs = db.policeRegistrations.filter(r => r.propertyId === removed.id);
  db.policeRegistrations = db.policeRegistrations.filter(r => r.propertyId !== removed.id);
  const ids = db.settings.automation?.autoMessagePropertyIds;
  if (Array.isArray(ids) && ids.includes(removed.id)) {
    db.settings = { ...db.settings, automation: { ...db.settings.automation, autoMessagePropertyIds: ids.filter(id => id !== removed.id) } };
  }
  await writeDB(db);
  await Promise.all(removedRegs.map(deleteRegistrationFiles));
  res.json({ success: true, removed: removed.id });
}));

export default router;
