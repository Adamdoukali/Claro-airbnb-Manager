import { Router } from 'express';
import { readDB } from '../database.js';
import { requireAuth } from '../auth.js';
import { isFeatureOn, requireFeature, requireRole } from '../features.js';
import { todayIsoDate, daysUntil } from '../automation.js';
import { portalUrl, getBaseUrl } from '../utils.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'assistant'));

const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

function bookingRow(db, b, baseUrl) {
  const property = db.properties.find(p => p.id === b.propertyId);
  const reg = db.policeRegistrations.find(r => r.bookingId === b.id) || null;
  return {
    id: b.id,
    propertyId: b.propertyId,
    propertyName: property?.name || '?',
    guestName: b.guestName,
    guestPhone: b.guestPhone || reg?.guestPhone || '',
    guestsCount: b.guestsCount || reg?.guestDetails?.totalGuests || null,
    source: b.source,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    hospitableReservationId: b.hospitableReservationId || reg?.hospitableReservationId || null,
    registration: reg ? {
      id: reg.id,
      status: reg.status,
      accessCode: reg.accessCode,
      portalUrl: portalUrl(baseUrl, reg.accessCode),
      messageSentAt: reg.messageSentAt,
      messageChannel: reg.messageChannel,
      message: reg.automatedMessage || '',
      expiresAt: reg.expiresAt,
      completedAt: reg.completedAt,
      manualEntry: Boolean(reg.guestDetails?.guests?.some(g => g.ocrReadable === false))
    } : null
  };
}

/** "Aujourd'hui": arrivals, departures, turnovers, guests in house, next 7 days, alerts. */
router.get('/today', requireFeature('todayView'), (req, res) => {
  const db = readDB();
  const baseUrl = getBaseUrl(req);
  const today = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.date : todayIsoDate();
  const active = db.bookings.filter(b => b.status !== 'cancelled' && b.source !== 'blocked');
  const rows = active.map(b => bookingRow(db, b, baseUrl));

  const arrivals = rows.filter(r => r.checkIn === today);
  const departures = rows.filter(r => r.checkOut === today);
  const inStay = rows.filter(r => r.checkIn < today && r.checkOut > today);
  const turnovers = departures
    .filter(d => arrivals.some(a => a.propertyId === d.propertyId))
    .map(d => ({ ...d, nextGuest: arrivals.find(a => a.propertyId === d.propertyId) }));
  const horizon = addDays(today, 7);
  const upcoming = rows
    .filter(r => r.checkIn > today && r.checkIn <= horizon)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.propertyName.localeCompare(b.propertyName));

  const attention = isFeatureOn('attention') ? buildAttention(db, rows, today) : null;
  const openIssues = isFeatureOn('issues') ? db.issues.filter(i => i.status === 'open').length : 0;
  const openTasks = isFeatureOn('tasks') ? db.tasks.filter(t => t.status !== 'done' && t.dueDate <= today).length : 0;

  res.json({ date: today, arrivals, departures, turnovers, inStay, upcoming, attention, openIssues, openTasks });
});

function buildAttention(db, rows, today) {
  const items = [];
  const soon = addDays(today, 2);
  for (const r of rows) {
    const reg = r.registration;
    const arrivesSoon = r.checkIn >= today && r.checkIn <= soon;
    if (arrivesSoon && (!reg || reg.status !== 'completed')) {
      items.push({
        kind: 'form_missing', severity: 'high', booking: r,
        label: `${r.guestName} arrive ${r.checkIn === today ? "aujourd'hui" : `le ${r.checkIn}`} et n'a pas complété son enregistrement`,
        action: reg ? (r.hospitableReservationId ? 'resend_hospitable' : 'send_whatsapp') : 'create_code'
      });
    }
    if (reg?.status === 'completed' && reg.manualEntry) {
      items.push({
        kind: 'manual_entry', severity: 'medium', booking: r,
        label: `${r.guestName} : pièce d'identité illisible, numéro saisi à la main — à vérifier sur le PDF`,
        action: 'open_pdf'
      });
    }
    if (reg && reg.status !== 'completed' && !reg.messageSentAt && !r.hospitableReservationId && r.checkIn >= today) {
      items.push({
        kind: 'no_thread', severity: 'low', booking: r,
        label: `${r.guestName} (réservation ${r.source}) : aucun message envoyé, pas de messagerie Hospitable`,
        action: 'send_whatsapp'
      });
    }
    if (reg && reg.status !== 'completed' && reg.expiresAt && reg.expiresAt < new Date().toISOString() && r.checkOut >= today) {
      items.push({
        kind: 'code_expired', severity: 'medium', booking: r,
        label: `${r.guestName} : le code ${reg.accessCode} a expiré avant d'être utilisé`,
        action: 'create_code'
      });
    }
  }
  if (isFeatureOn('issues')) {
    for (const i of db.issues.filter(i => i.status === 'open')) {
      const b = rows.find(r => r.id === i.bookingId);
      items.push({ kind: 'issue', severity: i.severity || 'medium', booking: b || null, issueId: i.id, label: `Incident ouvert : ${i.title}${b ? ` (${b.guestName}, ${b.propertyName})` : ''}`, action: 'open_issue' });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);
  return { count: items.length, items };
}

/** Occupancy / nights / revenue per property and per month. */
router.get('/metrics', requireFeature('metrics'), (req, res) => {
  const db = readDB();
  const year = Number(req.query.year) || new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const daysInMonth = m => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();

  const perProperty = db.properties.map(p => {
    const bookings = db.bookings.filter(b => b.propertyId === p.id && b.status !== 'cancelled' && b.source !== 'blocked');
    const monthly = months.map(m => {
      const start = `${m}-01`;
      const end = addDays(`${m}-${String(daysInMonth(m)).padStart(2, '0')}`, 1);
      let nights = 0, revenue = 0, count = 0, priced = 0;
      for (const b of bookings) {
        const from = b.checkIn > start ? b.checkIn : start;
        const to = b.checkOut < end ? b.checkOut : end;
        const n = daysUntil(to, from);
        if (n <= 0) continue;
        nights += n;
        if (b.checkIn >= start && b.checkIn < end) count++;
        if (Number.isFinite(Number(b.totalPrice)) && b.totalPrice !== null) {
          const total = daysUntil(b.checkOut, b.checkIn) || 1;
          revenue += Number(b.totalPrice) * (n / total);
          priced++;
        }
      }
      return { month: m, nights, occupancy: Math.round((nights / daysInMonth(m)) * 100), bookings: count, revenue: Math.round(revenue), priced };
    });
    const totalNights = monthly.reduce((s, x) => s + x.nights, 0);
    const daysInYear = months.reduce((s, m) => s + daysInMonth(m), 0);
    return {
      propertyId: p.id, name: p.name, city: p.city,
      monthly,
      totalNights,
      occupancy: Math.round((totalNights / daysInYear) * 100),
      bookings: monthly.reduce((s, x) => s + x.bookings, 0),
      revenue: monthly.reduce((s, x) => s + x.revenue, 0),
      pricedBookings: bookings.filter(b => b.totalPrice !== null && b.totalPrice !== undefined).length
    };
  });

  res.json({ year, months, properties: perProperty, currency: 'MAD' });
});

export default router;
