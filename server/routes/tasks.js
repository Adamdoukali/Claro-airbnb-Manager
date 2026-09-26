import { Router } from 'express';
import { readDB, writeDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { requireFeature, requireRole } from '../features.js';
import { guestLimiter } from '../middleware.js';
import { todayIsoDate } from '../automation.js';
import { asyncHandler, newId, randomToken, str, isIsoDate } from '../utils.js';

/** Cleaner page (no session): identified by the task token in the link. */
export const publicTasksRouter = Router();
/** Host / assistant / cleaner accounts. */
export const hostTasksRouter = Router();

const DEFAULT_CHECKLIST = [
  'Draps et serviettes changés',
  'Salle de bain nettoyée',
  'Cuisine et vaisselle',
  'Sols aspirés et lavés',
  'Poubelles vidées',
  'Consommables (papier, savon, café)',
  'Photos de contrôle envoyées'
];

const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

/**
 * One cleaning task per check-out of the coming days. Same-day turnovers are flagged urgent.
 * Idempotent: called from the task list and from the automation pass.
 */
export function ensureCleaningTasks(db, { horizonDays = 30 } = {}) {
  const today = todayIsoDate();
  const horizon = addDays(today, horizonDays);
  let created = 0;
  for (const b of db.bookings) {
    if (b.status === 'cancelled' || b.source === 'blocked') continue;
    if (!b.checkOut || b.checkOut < today || b.checkOut > horizon) continue;
    if (db.tasks.some(t => t.bookingId === b.id && t.type === 'cleaning')) continue;
    const sameDay = db.bookings.some(o => o.id !== b.id && o.propertyId === b.propertyId && o.status !== 'cancelled' && o.source !== 'blocked' && o.checkIn === b.checkOut);
    db.tasks.push({
      id: newId('task'),
      type: 'cleaning',
      propertyId: b.propertyId,
      bookingId: b.id,
      title: `Ménage après ${b.guestName || 'départ'}`,
      dueDate: b.checkOut,
      urgent: sameDay,
      status: 'todo',
      assigneeName: '',
      assigneePhone: '',
      checklist: DEFAULT_CHECKLIST.map(label => ({ label, done: false })),
      notes: '',
      token: randomToken(12),
      createdAt: new Date().toISOString(),
      doneAt: null
    });
    created++;
  }
  // Cancelled bookings: drop their pending task.
  const before = db.tasks.length;
  db.tasks = db.tasks.filter(t => {
    if (t.status === 'done' || !t.bookingId) return true;
    const b = db.bookings.find(x => x.id === t.bookingId);
    return b && b.status !== 'cancelled';
  });
  return { created, removed: before - db.tasks.length };
}

function publicTask(db, t) {
  const property = db.properties.find(p => p.id === t.propertyId);
  const booking = db.bookings.find(b => b.id === t.bookingId) || null;
  const next = booking ? db.bookings.find(o => o.propertyId === t.propertyId && o.id !== booking.id && o.status !== 'cancelled' && o.source !== 'blocked' && o.checkIn === booking.checkOut) : null;
  return {
    ...t,
    propertyName: property?.name || '?',
    propertyAddress: property?.address || '',
    propertyCity: property?.city || '',
    guestName: booking?.guestName || '',
    checkOut: booking?.checkOut || t.dueDate,
    nextArrival: next ? { guestName: next.guestName, checkIn: next.checkIn, guestsCount: next.guestsCount || null } : null
  };
}

// ---------------------------------------------------------------------------
// Host side
// ---------------------------------------------------------------------------
hostTasksRouter.use(requireAuth, requireFeature('tasks'));

hostTasksRouter.get('/', asyncHandler(async (req, res) => {
  const db = readDB();
  if (req.user.role !== 'cleaner') {
    const r = ensureCleaningTasks(db);
    if (r.created || r.removed) await writeDB(db);
  }
  let list = db.tasks;
  if (req.query.propertyId) list = list.filter(t => t.propertyId === req.query.propertyId);
  if (req.query.status) list = list.filter(t => t.status === req.query.status);
  // A cleaner sees only the tasks assigned to their account email/name.
  if (req.user.role === 'cleaner') list = list.filter(t => (t.assigneeEmail || '').toLowerCase() === req.user.email);
  list = [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || Number(b.urgent) - Number(a.urgent));
  res.json(list.map(t => publicTask(db, t)));
}));

hostTasksRouter.post('/', requireRole('admin', 'assistant'), asyncHandler(async (req, res) => {
  const db = readDB();
  const body = req.body || {};
  const propertyId = str(body.propertyId, 100);
  if (!db.properties.some(p => p.id === propertyId)) return res.status(404).json({ error: 'Logement introuvable' });
  const dueDate = str(body.dueDate, 10);
  if (!isIsoDate(dueDate)) return res.status(400).json({ error: 'Date (AAAA-MM-JJ) requise' });
  const task = {
    id: newId('task'),
    type: str(body.type, 30) || 'other',
    propertyId,
    bookingId: null,
    title: str(body.title, 160) || 'Tâche',
    dueDate,
    urgent: Boolean(body.urgent),
    status: 'todo',
    assigneeName: str(body.assigneeName, 100),
    assigneePhone: str(body.assigneePhone, 40),
    assigneeEmail: str(body.assigneeEmail, 200).toLowerCase(),
    checklist: (Array.isArray(body.checklist) ? body.checklist : DEFAULT_CHECKLIST).slice(0, 30).map(x => ({ label: str(typeof x === 'string' ? x : x?.label, 120), done: false })).filter(x => x.label),
    notes: str(body.notes, 2000),
    token: randomToken(12),
    createdAt: new Date().toISOString(),
    doneAt: null
  };
  db.tasks.push(task);
  await writeDB(db);
  res.status(201).json(publicTask(db, task));
}));

hostTasksRouter.put('/:id', asyncHandler(async (req, res) => {
  const db = readDB();
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  const body = req.body || {};
  const isCleaner = req.user.role === 'cleaner';
  if (!isCleaner) {
    for (const f of ['title', 'assigneeName', 'assigneePhone', 'notes']) if (body[f] !== undefined) task[f] = str(body[f], f === 'notes' ? 2000 : 160);
    if (body.assigneeEmail !== undefined) task.assigneeEmail = str(body.assigneeEmail, 200).toLowerCase();
    if (body.dueDate !== undefined && isIsoDate(body.dueDate)) task.dueDate = body.dueDate;
    if (body.urgent !== undefined) task.urgent = Boolean(body.urgent);
  }
  if (Array.isArray(body.checklist)) {
    task.checklist = body.checklist.slice(0, 30).map(x => ({ label: str(x?.label, 120), done: Boolean(x?.done) })).filter(x => x.label);
  }
  if (body.status === 'todo' || body.status === 'done') {
    task.status = body.status;
    task.doneAt = body.status === 'done' ? new Date().toISOString() : null;
  }
  await writeDB(db);
  res.json(publicTask(db, task));
}));

hostTasksRouter.delete('/:id', requireRole('admin', 'assistant'), asyncHandler(async (req, res) => {
  const db = readDB();
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tâche introuvable' });
  db.tasks.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Cleaner page (token link, no login)
// ---------------------------------------------------------------------------
publicTasksRouter.use(guestLimiter, requireFeature('tasks'));

function findByToken(db, token) {
  const t = String(token || '').trim();
  return t.length >= 16 ? db.tasks.find(x => x.token === t) : null;
}

publicTasksRouter.get('/public/:token', (req, res) => {
  const db = readDB();
  const task = findByToken(db, req.params.token);
  if (!task) return res.status(404).json({ error: 'Lien de tâche invalide' });
  res.json(publicTask(db, task));
});

publicTasksRouter.put('/public/:token', asyncHandler(async (req, res) => {
  const db = readDB();
  const task = findByToken(db, req.params.token);
  if (!task) return res.status(404).json({ error: 'Lien de tâche invalide' });
  const body = req.body || {};
  if (Array.isArray(body.checklist)) {
    task.checklist = task.checklist.map((item, i) => ({ ...item, done: Boolean(body.checklist[i]?.done) }));
  }
  if (body.notes !== undefined) task.cleanerNotes = str(body.notes, 1000);
  if (body.status === 'done' || body.status === 'todo') {
    task.status = body.status;
    task.doneAt = body.status === 'done' ? new Date().toISOString() : null;
  }
  await writeDB(db);
  res.json(publicTask(db, task));
}));
