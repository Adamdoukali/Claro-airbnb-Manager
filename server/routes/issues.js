import { Router } from 'express';
import { readDB, writeDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { requireFeature, requireRole } from '../features.js';
import { asyncHandler, newId, str } from '../utils.js';

const router = Router();
router.use(requireAuth, requireFeature('issues'), requireRole('admin', 'assistant'));

const CATEGORIES = new Set(['damage', 'noise', 'cleanliness', 'late_checkout', 'deposit', 'complaint', 'other']);
const SEVERITIES = new Set(['low', 'medium', 'high']);

function withContext(db, i) {
  const booking = db.bookings.find(b => b.id === i.bookingId) || null;
  const property = db.properties.find(p => p.id === (i.propertyId || booking?.propertyId)) || null;
  return { ...i, guestName: booking?.guestName || '', propertyName: property?.name || '', checkIn: booking?.checkIn || null, checkOut: booking?.checkOut || null };
}

router.get('/', (req, res) => {
  const db = readDB();
  let list = db.issues;
  if (req.query.bookingId) list = list.filter(i => i.bookingId === req.query.bookingId);
  if (req.query.propertyId) list = list.filter(i => i.propertyId === req.query.propertyId);
  if (req.query.status) list = list.filter(i => i.status === req.query.status);
  res.json([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(i => withContext(db, i)));
});

router.post('/', asyncHandler(async (req, res) => {
  const db = readDB();
  const body = req.body || {};
  const booking = body.bookingId ? db.bookings.find(b => b.id === body.bookingId) : null;
  const propertyId = str(body.propertyId, 100) || booking?.propertyId || '';
  if (!db.properties.some(p => p.id === propertyId)) return res.status(404).json({ error: 'Logement introuvable' });
  const title = str(body.title, 160);
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  const issue = {
    id: newId('issue'),
    propertyId,
    bookingId: booking?.id || null,
    title,
    category: CATEGORIES.has(body.category) ? body.category : 'other',
    severity: SEVERITIES.has(body.severity) ? body.severity : 'medium',
    description: str(body.description, 4000),
    amount: Number.isFinite(Number(body.amount)) && body.amount !== '' && body.amount !== null ? Number(body.amount) : null,
    status: 'open',
    createdBy: req.user.email,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolution: ''
  };
  db.issues.push(issue);
  await writeDB(db);
  res.status(201).json(withContext(db, issue));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const db = readDB();
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Incident introuvable' });
  const body = req.body || {};
  if (body.title !== undefined) issue.title = str(body.title, 160) || issue.title;
  if (body.description !== undefined) issue.description = str(body.description, 4000);
  if (body.category !== undefined && CATEGORIES.has(body.category)) issue.category = body.category;
  if (body.severity !== undefined && SEVERITIES.has(body.severity)) issue.severity = body.severity;
  if (body.amount !== undefined) issue.amount = Number.isFinite(Number(body.amount)) && body.amount !== '' && body.amount !== null ? Number(body.amount) : null;
  if (body.status === 'open' || body.status === 'resolved') {
    issue.status = body.status;
    issue.resolvedAt = body.status === 'resolved' ? new Date().toISOString() : null;
  }
  if (body.resolution !== undefined) issue.resolution = str(body.resolution, 2000);
  await writeDB(db);
  res.json(withContext(db, issue));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const db = readDB();
  const idx = db.issues.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Incident introuvable' });
  db.issues.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
}));

export default router;
