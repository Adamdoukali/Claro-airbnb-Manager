import ical from 'node-ical';
import { readDB, writeDB } from './database.js';

/**
 * Format a Date object to YYYYMMDD string for iCal all-day events
 */
function formatDateToIcal(dateStr) {
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Fetch and sync external iCal feeds for a property (Airbnb & Booking.com)
 */
export async function syncPropertyFeeds(propertyId) {
  const db = readDB();
  const property = db.properties.find(p => p.id === propertyId);
  if (!property) throw new Error("Property not found");

  const results = { airbnb: 0, booking: 0, errors: [] };

  // 1. Sync Airbnb iCal
  if (property.airbnbIcalUrl && property.airbnbIcalUrl.trim().startsWith('http')) {
    try {
      const parsed = await ical.async.fromURL(property.airbnbIcalUrl.trim());
      let count = 0;
      for (const k in parsed) {
        if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue;
        const ev = parsed[k];
        if (ev.type === 'VEVENT') {
          const checkIn = new Date(ev.start).toISOString().split('T')[0];
          const checkOut = new Date(ev.end).toISOString().split('T')[0];
          const externalUid = ev.uid || `airbnb_${k}`;

          // Check if already exists
          const existingIdx = db.bookings.findIndex(b => b.externalUid === externalUid);
          if (existingIdx >= 0) {
            db.bookings[existingIdx].checkIn = checkIn;
            db.bookings[existingIdx].checkOut = checkOut;
            db.bookings[existingIdx].status = 'confirmed';
          } else {
            db.bookings.push({
              id: `bkg_ab_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              propertyId: property.id,
              source: 'airbnb',
              guestName: ev.summary || 'Réservation Airbnb',
              guestEmail: '',
              guestPhone: '',
              checkIn,
              checkOut,
              status: 'confirmed',
              totalPrice: null,
              currency: 'MAD',
              notes: ev.description || 'Importé depuis Airbnb iCal',
              externalUid,
              createdAt: new Date().toISOString()
            });
          }
          count++;
        }
      }
      results.airbnb = count;
    } catch (err) {
      console.error("Error syncing Airbnb iCal:", err.message);
      results.errors.push(`Airbnb sync error: ${err.message}`);
    }
  }

  // 2. Sync Booking.com iCal
  if (property.bookingIcalUrl && property.bookingIcalUrl.trim().startsWith('http')) {
    try {
      const parsed = await ical.async.fromURL(property.bookingIcalUrl.trim());
      let count = 0;
      for (const k in parsed) {
        if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue;
        const ev = parsed[k];
        if (ev.type === 'VEVENT') {
          const checkIn = new Date(ev.start).toISOString().split('T')[0];
          const checkOut = new Date(ev.end).toISOString().split('T')[0];
          const externalUid = ev.uid || `booking_${k}`;

          const existingIdx = db.bookings.findIndex(b => b.externalUid === externalUid);
          if (existingIdx >= 0) {
            db.bookings[existingIdx].checkIn = checkIn;
            db.bookings[existingIdx].checkOut = checkOut;
            db.bookings[existingIdx].status = 'confirmed';
          } else {
            db.bookings.push({
              id: `bkg_bk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              propertyId: property.id,
              source: 'booking',
              guestName: ev.summary || 'Réservation Booking.com',
              guestEmail: '',
              guestPhone: '',
              checkIn,
              checkOut,
              status: 'confirmed',
              totalPrice: null,
              currency: 'MAD',
              notes: ev.description || 'Importé depuis Booking.com iCal',
              externalUid,
              createdAt: new Date().toISOString()
            });
          }
          count++;
        }
      }
      results.booking = count;
    } catch (err) {
      console.error("Error syncing Booking.com iCal:", err.message);
      results.errors.push(`Booking.com sync error: ${err.message}`);
    }
  }

  // Update property timestamp
  property.lastSyncAt = new Date().toISOString();

  // Log sync result
  db.syncLogs.unshift({
    id: `log_${Date.now()}`,
    propertyId: property.id,
    timestamp: new Date().toISOString(),
    source: 'channel_sync',
    status: results.errors.length === 0 ? 'success' : 'partial',
    message: `Synchronisation terminée: ${results.airbnb} réservations Airbnb, ${results.booking} réservations Booking.com. ${results.errors.join(' | ')}`,
    eventsCount: results.airbnb + results.booking
  });

  // Limit logs to last 50
  if (db.syncLogs.length > 50) db.syncLogs = db.syncLogs.slice(0, 50);

  writeDB(db);
  return { results, lastSyncAt: property.lastSyncAt };
}

/**
 * Generate iCal feed string for a given property (to be consumed by Airbnb & Booking.com)
 */
export function generatePropertyIcal(propertyId) {
  const db = readDB();
  const property = db.properties.find(p => p.id === propertyId);
  const bookings = db.bookings.filter(b => b.propertyId === propertyId && b.status !== 'cancelled');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Airbnb Morocco Manager//MultiCalendar Sync 1.0//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${(property?.name || 'Logement').replace(/[^a-zA-Z0-9 ]/g, '')} Calendar`,
    'X-WR-TIMEZONE:Africa/Casablanca'
  ];

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  bookings.forEach(b => {
    const startDate = formatDateToIcal(b.checkIn);
    const endDate = formatDateToIcal(b.checkOut);
    const summary = b.source === 'blocked' 
      ? 'Bloqué / Indisponible' 
      : `Réservé (${b.source.toUpperCase()}${b.guestName ? ' - ' + b.guestName : ''})`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:event_${b.id}@airbnb-morocco-manager.local`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${startDate}`);
    lines.push(`DTEND;VALUE=DATE:${endDate}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:Réservation synchronisée via Airbnb Morocco Manager - Source: ${b.source}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
