import crypto from 'crypto';
import { readDB, writeDB, getSettings, updateSettings } from './database.js';
import { config } from './config.js';
import { upsertRegistration } from './registrationService.js';
import { autoMessageDecision } from './automation.js';
import { HttpError, newId, str } from './utils.js';

const missingKey = () => new HttpError(400, 'Clé API Hospitable requise (Personal Access Token). Renseignez-la dans le menu Hospitable.');

// Hospitable Public API v2 (Personal Access Token).
// NB: "api.hospitable.com" does not exist, the public API lives on this host.
export const HOSPITABLE_API_BASE = 'https://public.api.hospitable.com/v2';

/** Active token: explicit override > saved settings > environment. */
export function getActiveHospitableApiKey(overrideKey) {
  if (overrideKey && String(overrideKey).trim()) return String(overrideKey).trim();
  const saved = getSettings().hospitableApiKey;
  if (saved && saved.trim()) return saved.trim();
  return config.hospitableApiKey || '';
}

async function hospitableFetch(token, path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${HOSPITABLE_API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) v.forEach(item => url.searchParams.append(`${k}[]`, item));
      else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const detail = json?.message || json?.error || text.slice(0, 200) || res.statusText;
    // Upstream failures are reported to our client as 400 (config/key problem) or 502 (Hospitable down),
    // never as 401: a 401 from our API means "host session expired" and would log the host out.
    throw new HttpError(
      res.status >= 500 ? 502 : 400,
      res.status === 401
        ? 'Clé API Hospitable invalide ou expirée (401).'
        : `Erreur Hospitable (${res.status}) : ${detail}`
    );
  }
  return json;
}

/** Follow Laravel-style pagination (meta.current_page / meta.last_page). */
async function fetchAllPages(token, path, query = {}) {
  const items = [];
  let page = 1;
  for (let guard = 0; guard < 50; guard++) {
    const json = await hospitableFetch(token, path, { query: { ...query, per_page: 100, page } });
    items.push(...(json?.data || []));
    const last = json?.meta?.last_page ?? 1;
    if (page >= last || !json?.data?.length) break;
    page++;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------
function normalizeChannel(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('airbnb')) return 'airbnb';
  if (p.includes('booking')) return 'booking';
  if (p.includes('vrbo') || p.includes('homeaway')) return 'vrbo';
  return 'direct';
}

function normalizeStatus(r) {
  const category = String(
    r.reservation_status?.current?.category || r.status || 'accepted'
  ).toLowerCase();
  if (['cancelled', 'canceled', 'declined', 'not accepted', 'expired', 'denied'].includes(category)) return 'cancelled';
  if (['request', 'checkpoint', 'pending', 'inquiry'].includes(category)) return 'pending';
  return 'confirmed';
}

export function normalizeProperty(hp) {
  const listings = (hp.listings || []).map(l => {
    const channel = normalizeChannel(l.platform || l.channel);
    const listingId = l.platform_id || l.id || null;
    // Hospitable does not return listing URLs; Airbnb's is derivable from the platform id.
    const url = l.url || l.listing_url || (channel === 'airbnb' && /^\d+$/.test(String(listingId)) ? `https://www.airbnb.com/rooms/${listingId}` : null);
    return { channel, listingId, url, name: l.name || l.platform_name || null };
  });
  const addr = hp.address || {};
  const airbnbListing = listings.find(l => l.channel === 'airbnb');
  return {
    hospitableId: hp.id,
    name: str(hp.name || hp.public_name || 'Logement Hospitable', 120),
    city: str(addr.city || hp.city || '', 80),
    address: [addr.street, addr.city, addr.country].filter(Boolean).join(', ') || str(hp.address, 200) || '',
    picture: hp.picture || hp.image_url || null,
    airbnbUrl: airbnbListing?.url || '',
    channels: listings.length ? listings : [{ channel: 'airbnb', listingId: null, url: null, name: 'Airbnb' }]
  };
}

export function normalizeReservation(r) {
  const guest = r.guest || {};
  const phone = Array.isArray(guest.phone_numbers) ? guest.phone_numbers[0] : (guest.phone || '');
  const propertyIds = Array.isArray(r.properties)
    ? r.properties.map(p => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
    : [r.property_id || r.property?.id].filter(Boolean);

  return {
    hospitableId: r.id,
    confirmationCode: r.code || r.confirmation_code || r.id,
    channel: normalizeChannel(r.platform || r.channel),
    status: normalizeStatus(r),
    checkIn: String(r.arrival_date || r.start_date || r.check_in || '').slice(0, 10),
    checkOut: String(r.departure_date || r.end_date || r.check_out || '').slice(0, 10),
    guestName: [guest.first_name, guest.last_name].filter(Boolean).join(' ') || r.guest_name || 'Voyageur Hospitable',
    guestEmail: guest.email || '',
    guestPhone: typeof phone === 'object' ? (phone?.number || '') : (phone || ''),
    guestsCount: r.guests?.total ?? null,
    conversationId: r.conversation_id || null,
    propertyIds
  };
}

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------
export async function testHospitableConnection(apiKey) {
  const token = getActiveHospitableApiKey(apiKey);
  if (!token) throw missingKey();

  const json = await hospitableFetch(token, '/properties', { query: { include: 'listings', per_page: 100 } });
  const properties = (json?.data || []).map(normalizeProperty);

  await updateSettings({ hospitableApiKey: token, hospitableConnected: true });

  return {
    success: true,
    propertiesCount: properties.length,
    properties: properties.map(p => ({
      id: p.hospitableId, name: p.name, city: p.city, picture: p.picture, channels: p.channels
    }))
  };
}

export async function syncPropertiesFromHospitable(apiKey) {
  const token = getActiveHospitableApiKey(apiKey);
  if (!token) throw missingKey();

  const remote = await fetchAllPages(token, '/properties', { include: 'listings' });
  const db = readDB();
  let importedCount = 0;
  let updatedCount = 0;

  for (const hp of remote) {
    const data = normalizeProperty(hp);
    const existing = db.properties.find(p => p.hospitableId === data.hospitableId)
      || db.properties.find(p => !p.hospitableId && p.name.toLowerCase() === data.name.toLowerCase());

    if (existing) {
      Object.assign(existing, {
        hospitableId: data.hospitableId,
        name: data.name,
        city: data.city || existing.city,
        address: data.address || existing.address,
        airbnbUrl: data.airbnbUrl || existing.airbnbUrl,
        channels: data.channels,
        picture: data.picture,
        lastSyncAt: new Date().toISOString()
      });
      updatedCount++;
    } else {
      db.properties.push({
        id: newId('prop'),
        ...data,
        type: "Appartement meublé",
        airbnbIcalUrl: '',
        bookingIcalUrl: '',
        policeLicenseNumber: '',
        hostName: '',
        hostPhone: '',
        policePrecinct: '',
        icalToken: crypto.randomBytes(12).toString('hex'),
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      importedCount++;
    }
  }

  await writeDB(db);
  return { success: true, totalProperties: remote.length, importedCount, updatedCount, properties: db.properties };
}

/**
 * Pull reservations from Hospitable for the linked properties and mirror them locally.
 * Each new confirmed booking gets a police registration + access code.
 */
export async function syncHospitableReservations({ apiKey, propertyId = null, baseUrl, logOnlyChanges = false } = {}) {
  const token = getActiveHospitableApiKey(apiKey);
  if (!token) throw missingKey();

  const db = readDB();
  let targets = propertyId
    ? db.properties.filter(p => p.id === propertyId || p.hospitableId === propertyId)
    : db.properties;
  targets = targets.filter(p => p.hospitableId);

  if (targets.length === 0) {
    throw new HttpError(400, "Aucun logement lié à Hospitable. Cliquez d'abord sur « Importer logements ».");
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 365 * 86400000).toISOString().slice(0, 10);

  const reservations = await fetchAllPages(token, '/reservations', {
    properties: targets.map(p => p.hospitableId),
    start_date: start,
    end_date: end,
    include: 'guest,properties'
  });

  const settings = db.settings;
  let addedCount = 0, updatedCount = 0, unchangedCount = 0, skippedCount = 0, autoMessagesSent = 0;

  for (const raw of reservations) {
    const r = normalizeReservation(raw);
    if (!r.checkIn || !r.checkOut) { skippedCount++; continue; }

    const property = targets.find(p => r.propertyIds.includes(p.hospitableId));
    if (!property) { skippedCount++; continue; }

    const externalUid = `hospitable_${r.hospitableId}`;
    let booking = db.bookings.find(b =>
      b.hospitableReservationId === r.hospitableId || b.externalUid === externalUid
    );

    const fields = {
      hospitableReservationId: r.hospitableId,
      confirmationCode: r.confirmationCode,
      propertyId: property.id,
      source: r.channel,
      channel: r.channel,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      guestsCount: r.guestsCount,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      conversationId: r.conversationId,
      externalUid,
      updatedAt: new Date().toISOString()
    };

    if (booking) {
      const next = { ...fields, guestEmail: r.guestEmail || booking.guestEmail, guestPhone: r.guestPhone || booking.guestPhone };
      const changed = Object.keys(next).some(k => k !== 'updatedAt' && JSON.stringify(booking[k] ?? null) !== JSON.stringify(next[k] ?? null));
      if (changed) {
        Object.assign(booking, next);
        updatedCount++;
      } else {
        unchangedCount++;
      }
    } else {
      booking = {
        id: newId('bkg'),
        ...fields,
        totalPrice: null,
        currency: 'MAD',
        notes: `Synchronisé via Hospitable (${r.channel.toUpperCase()} - Réf : ${r.confirmationCode})`,
        createdAt: new Date().toISOString()
      };
      db.bookings.push(booking);
      addedCount++;
    }

    if (r.status === 'cancelled') continue;

    const { reg } = upsertRegistration({
      db, property, booking,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      language: settings.defaultLanguage || 'fr',
      baseUrl,
      hospitableReservationId: r.hospitableId
    });

    // Automated message: only when enabled for this property, future confirmed arrivals, once per booking.
    if (autoMessageDecision({ automation: settings.automation, property, booking, reg, todayIso }).due) {
      try {
        await sendHospitableMessage(token, r.hospitableId, reg.automatedMessage);
        reg.messageSentAt = new Date().toISOString();
        reg.messageChannel = 'hospitable';
        autoMessagesSent++;
      } catch (err) {
        console.warn(`[Hospitable] Envoi auto impossible pour ${r.guestName} :`, err.message);
      }
    }
  }

  // The scheduler runs every minute: only log passes that actually changed something.
  if (!logOnlyChanges || addedCount || updatedCount || autoMessagesSent) {
    db.syncLogs.unshift({
      id: newId('log'),
      propertyId: propertyId || 'all',
      timestamp: new Date().toISOString(),
      source: 'hospitable',
      status: 'success',
      message: `Sync Hospitable : ${reservations.length} reçues, ${addedCount} créées, ${updatedCount} mises à jour, ${unchangedCount} inchangées, ${skippedCount} ignorées.`,
      eventsCount: reservations.length
    });
    db.syncLogs = db.syncLogs.slice(0, 50);
  }
  db.settings = { ...db.settings, lastGlobalSync: new Date().toISOString(), hospitableConnected: true };

  await writeDB(db);

  return {
    success: true,
    totalReservations: reservations.length,
    addedCount, updatedCount, unchangedCount, skippedCount, autoMessagesSent,
    timestamp: new Date().toISOString()
  };
}

/** Send a message in the guest's Airbnb/Booking thread through Hospitable. */
export async function sendHospitableMessage(apiKey, reservationId, messageBody) {
  const token = getActiveHospitableApiKey(apiKey);
  if (!token) throw missingKey();
  if (!reservationId) throw new HttpError(400, 'Identifiant de réservation Hospitable requis');
  if (!messageBody) throw new HttpError(400, 'Corps du message requis');

  return hospitableFetch(token, `/reservations/${encodeURIComponent(reservationId)}/messages`, {
    method: 'POST',
    body: { body: messageBody }
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** HMAC-SHA256 (hex) of the raw request body, compared in constant time. */
export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) return true;
  if (!signatureHeader || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = String(signatureHeader).trim().replace(/^sha256=/i, '');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}

export async function handleHospitableWebhook(body, baseUrl) {
  const action = String(body?.action || body?.event || body?.type || '').toLowerCase();
  if (action && !action.startsWith('reservation')) {
    return { success: true, ignored: true, action };
  }

  const raw = body?.data?.reservation || body?.data;
  if (!raw || !raw.id) {
    return { success: false, message: 'Données de réservation absentes du webhook' };
  }

  const r = normalizeReservation(raw);
  const db = readDB();
  const settings = db.settings;
  // Remember the last delivery so the dashboard can show that the real-time channel is alive.
  db.settings = { ...db.settings, lastWebhookAt: new Date().toISOString() };
  const property = db.properties.find(p => r.propertyIds.includes(p.hospitableId));
  if (!property) {
    await writeDB(db);
    return { success: false, message: `Aucun logement local lié à la propriété Hospitable ${r.propertyIds.join(',') || '?'}` };
  }

  const externalUid = `hospitable_${r.hospitableId}`;
  let booking = db.bookings.find(b => b.hospitableReservationId === r.hospitableId || b.externalUid === externalUid);

  if (booking) {
    Object.assign(booking, {
      checkIn: r.checkIn || booking.checkIn,
      checkOut: r.checkOut || booking.checkOut,
      guestName: r.guestName || booking.guestName,
      guestEmail: r.guestEmail || booking.guestEmail,
      guestPhone: r.guestPhone || booking.guestPhone,
      status: r.status,
      channel: r.channel,
      source: r.channel,
      conversationId: r.conversationId || booking.conversationId,
      updatedAt: new Date().toISOString()
    });
  } else {
    if (!r.checkIn || !r.checkOut) return { success: false, message: 'Dates de séjour absentes' };
    booking = {
      id: newId('bkg'),
      hospitableReservationId: r.hospitableId,
      confirmationCode: r.confirmationCode,
      propertyId: property.id,
      source: r.channel,
      channel: r.channel,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      guestsCount: r.guestsCount,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      totalPrice: null,
      currency: 'MAD',
      notes: `Hospitable webhook [${action || 'reservation'}] (${r.channel.toUpperCase()} - Réf : ${r.confirmationCode})`,
      externalUid,
      conversationId: r.conversationId,
      createdAt: new Date().toISOString()
    };
    db.bookings.push(booking);
  }

  if (r.status === 'cancelled') {
    await writeDB(db);
    return { success: true, action, status: 'cancelled', confirmationCode: r.confirmationCode };
  }

  const { reg } = upsertRegistration({
    db, property, booking,
    guestName: r.guestName,
    guestPhone: r.guestPhone,
    language: settings.defaultLanguage || 'fr',
    baseUrl,
    hospitableReservationId: r.hospitableId
  });

  let autoMessageSent = false;
  const token = getActiveHospitableApiKey();
  if (token && autoMessageDecision({ automation: settings.automation, property, booking, reg }).due) {
    try {
      await sendHospitableMessage(token, r.hospitableId, reg.automatedMessage);
      reg.messageSentAt = new Date().toISOString();
      reg.messageChannel = 'hospitable';
      autoMessageSent = true;
    } catch (err) {
      console.warn('[Hospitable webhook] Envoi auto impossible :', err.message);
    }
  }

  await writeDB(db);
  return { success: true, action, guestName: r.guestName, channel: r.channel, code: reg.accessCode, autoMessageSent };
}
