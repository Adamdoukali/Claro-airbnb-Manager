import { generateFullAutomatedMessage } from './messages.js';
import { deleteFile } from './storage.js';
import { generateAccessCode, newId, portalUrl } from './utils.js';

/**
 * Create (or refresh) the police registration ("fiche") attached to a booking or guest.
 * The registration owns the 6-digit access code the guest uses on the portal.
 *
 * Does NOT persist: callers mutate `db` and call writeDB() themselves.
 */
export function upsertRegistration({
  db,
  property,
  booking = null,
  guestName,
  guestPhone = '',
  language = 'fr',
  baseUrl,
  hospitableReservationId = null
}) {
  let reg = null;
  if (booking) {
    reg = db.policeRegistrations.find(r =>
      r.bookingId === booking.id ||
      (hospitableReservationId && r.hospitableReservationId === hospitableReservationId)
    ) || null;
  }

  const code = reg ? reg.accessCode : generateAccessCode(db.policeRegistrations);
  const finalGuestName = guestName || booking?.guestName || 'Voyageur invité';
  const link = portalUrl(baseUrl, code);

  const automatedMessage = generateFullAutomatedMessage({
    guestName: finalGuestName,
    propertyName: property?.name,
    city: property?.city,
    accessCode: code,
    portalUrl: link,
    hostName: property?.hostName,
    checkIn: booking?.checkIn,
    checkOut: booking?.checkOut,
    language
  });

  const expiresAt = booking?.checkOut
    ? new Date(new Date(booking.checkOut).getTime() + 2 * 86400000).toISOString()
    : new Date(Date.now() + 30 * 86400000).toISOString();

  if (reg) {
    // Refresh the message/expiry but never touch a completed form's data.
    if (reg.status !== 'completed') {
      reg.guestName = finalGuestName;
      reg.guestPhone = guestPhone || reg.guestPhone || '';
      reg.automatedMessage = automatedMessage;
      reg.expiresAt = expiresAt;
    }
    if (hospitableReservationId && !reg.hospitableReservationId) {
      reg.hospitableReservationId = hospitableReservationId;
    }
    return { reg, created: false, portalUrl: link };
  }

  reg = {
    id: newId('reg'),
    accessCode: code,
    propertyId: property?.id || booking?.propertyId || null,
    bookingId: booking?.id || null,
    hospitableReservationId: hospitableReservationId || booking?.hospitableReservationId || null,
    guestName: finalGuestName,
    guestPhone: guestPhone || booking?.guestPhone || '',
    status: 'pending',
    expiresAt,
    automatedMessage,
    messageSentAt: null,
    messageChannel: null,
    guestDetails: null,
    idDocumentPath: null,
    signaturePath: null,
    pdfPath: null,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
  db.policeRegistrations.push(reg);
  return { reg, created: true, portalUrl: link };
}

/**
 * Re-render the stored message of every pending registration (after the host edits the templates
 * or changes the default language). Completed forms are left untouched. Does not persist.
 */
export function refreshPendingMessages(db, baseUrl) {
  let count = 0;
  for (const reg of db.policeRegistrations) {
    if (reg.status === 'completed') continue;
    const property = db.properties.find(p => p.id === reg.propertyId);
    const booking = reg.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : null;
    reg.automatedMessage = generateFullAutomatedMessage({
      guestName: reg.guestName,
      propertyName: property?.name,
      city: property?.city,
      accessCode: reg.accessCode,
      portalUrl: portalUrl(baseUrl, reg.accessCode),
      hostName: property?.hostName,
      checkIn: booking?.checkIn,
      checkOut: booking?.checkOut,
      language: db.settings.defaultLanguage || 'fr'
    });
    count++;
  }
  return count;
}

/** Storage keys (ID scans, signature, PDF) owned by a registration. */
export function registrationFileKeys(reg) {
  const keys = new Set();
  for (const k of [reg.idDocumentPath, reg.signaturePath, reg.pdfPath]) if (k) keys.add(k);
  for (const g of reg.guestDetails?.guests || []) if (g?.idDocumentPath) keys.add(g.idDocumentPath);
  return [...keys];
}

/** Best-effort removal of a registration's files (never blocks the deletion itself). */
export async function deleteRegistrationFiles(reg) {
  await Promise.all(registrationFileKeys(reg).map(k => deleteFile(k).catch(() => {})));
}
