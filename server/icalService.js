import ical from 'node-ical';
import { readDB, writeDB } from './database.js';
import { newId } from './utils.js';

function toIsoDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateToIcal(dateStr) {
  return toIsoDay(dateStr).replace(/-/g, '');
}

function escapeIcalText(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Import one external iCal feed (Airbnb or Booking.com) into the local bookings.
 * Returns the number of events processed.
 */
async function importFeed(db, property, url, source) {
  const parsed = await ical.async.fromURL(url.trim());
  let count = 0;
  const seen = new Set();

  for (const key of Object.keys(parsed)) {
    const ev = parsed[key];
    if (!ev || ev.type !== 'VEVENT' || !ev.start || !ev.end) continue;

    const checkIn = toIsoDay(ev.start);
    const checkOut = toIsoDay(ev.end);
    const externalUid = ev.uid || `${source}_${key}`;
    seen.add(externalUid);

    // Airbnb exports "Not available" blocks alongside real reservations.
    const summary = String(ev.summary || '');
    const isBlock = /not available|indisponible|bloqu/i.test(summary);

    const existing = db.bookings.find(b => b.externalUid === externalUid);
    if (existing) {
      existing.checkIn = checkIn;
      existing.checkOut = checkOut;
      existing.status = isBlock ? 'blocked' : 'confirmed';
    } else {
      db.bookings.push({
        id: newId('bkg'),
        propertyId: property.id,
        source: isBlock ? 'blocked' : source,
        channel: source,
        guestName: isBlock ? 'Dates bloquées' : (summary || `Réservation ${source}`),
        guestEmail: '',
        guestPhone: '',
        checkIn,
        checkOut,
        status: isBlock ? 'blocked' : 'confirmed',
        totalPrice: null,
        currency: 'MAD',
        notes: ev.description || `Importé depuis le flux iCal ${source}`,
        externalUid,
        createdAt: new Date().toISOString()
      });
    }
    count++;
  }

  // Events that disappeared from the feed were cancelled on the channel.
  for (const b of db.bookings) {
    if (b.propertyId === property.id && b.channel === source && b.externalUid && !seen.has(b.externalUid) && b.status !== 'cancelled') {
      if (b.externalUid.startsWith('hospitable_')) continue;
      b.status = 'cancelled';
    }
  }
  return count;
}

/** Fetch and sync the Airbnb and Booking.com iCal feeds of a property. */
export async function syncPropertyFeeds(propertyId) {
  const db = readDB();
  const property = db.properties.find(p => p.id === propertyId);
  if (!property) throw new Error('Logement introuvable');

  const results = { airbnb: 0, booking: 0, errors: [] };
  const feeds = [
    ['airbnb', property.airbnbIcalUrl],
    ['booking', property.bookingIcalUrl]
  ];

  for (const [source, url] of feeds) {
    if (!url || !/^https?:\/\//i.test(url.trim())) continue;
    if (!/\.ics(\?|$)/i.test(url.trim()) && !/ical|calendar/i.test(url)) {
      results.errors.push(`${source}: l'URL ne ressemble pas à un flux iCal (.ics).`);
      continue;
    }
    try {
      results[source] = await importFeed(db, property, url, source);
    } catch (err) {
      console.error(`[iCal] ${source} :`, err.message);
      results.errors.push(`${source}: ${err.message}`);
    }
  }

  property.lastSyncAt = new Date().toISOString();
  db.syncLogs.unshift({
    id: newId('log'),
    propertyId: property.id,
    timestamp: property.lastSyncAt,
    source: 'channel_sync',
    status: results.errors.length === 0 ? 'success' : 'partial',
    message: `iCal : ${results.airbnb} événements Airbnb, ${results.booking} événements Booking.com.${results.errors.length ? ' ' + results.errors.join(' | ') : ''}`,
    eventsCount: results.airbnb + results.booking
  });
  db.syncLogs = db.syncLogs.slice(0, 50);

  await writeDB(db);
  return { results, lastSyncAt: property.lastSyncAt };
}

/** RFC 5545 feed of a property's occupied dates, for Airbnb / Booking.com to subscribe to. */
export function generatePropertyIcal(propertyId) {
  const db = readDB();
  const property = db.properties.find(p => p.id === propertyId);
  if (!property) throw new Error('Logement introuvable');

  const bookings = db.bookings.filter(b => b.propertyId === propertyId && b.status !== 'cancelled' && b.status !== 'pending');
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Claro Airbnb Manager//Calendar Sync 1.0//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcalText(property.name)}`,
    'X-WR-TIMEZONE:Africa/Casablanca'
  ];

  for (const b of bookings) {
    // Never leak guest names to third-party channels: only availability.
    const summary = b.status === 'blocked' || b.source === 'blocked' ? 'Not available' : 'Reserved';
    lines.push(
      'BEGIN:VEVENT',
      `UID:event_${b.id}@claro-airbnb-manager`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatDateToIcal(b.checkIn)}`,
      `DTEND;VALUE=DATE:${formatDateToIcal(b.checkOut)}`,
      `SUMMARY:${summary}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
