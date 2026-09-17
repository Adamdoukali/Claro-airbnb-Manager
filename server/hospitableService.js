import { readDB, writeDB } from './database.js';

const HOSPITABLE_API_BASE = 'https://api.hospitable.com/v2';

/**
 * Build the full personalized automated message for a guest (French, English, or Bilingual)
 */
export function generateFullAutomatedMessage({ 
  guestName, 
  propertyName, 
  city, 
  accessCode, 
  portalUrl, 
  hostName,
  checkIn,
  checkOut,
  language = 'fr' 
}) {
  const name = guestName ? guestName.split(' ')[0] : 'cher voyageur';
  const datesFr = checkIn && checkOut ? ` du ${checkIn} au ${checkOut}` : '';
  const datesEn = checkIn && checkOut ? ` from ${checkIn} to ${checkOut}` : '';

  const msgFr = `Bonjour ${name} ! 🇲🇦

Bienvenue à ${propertyName || 'notre hébergement'}${city ? ` (${city})` : ''} ! Nous avons hâte de vous accueillir pour votre séjour${datesFr}.

📋 CONFORMITÉ TOURISTIQUE MAROC (DGSN) :
Conformément à la réglementation marocaine en vigueur, chaque voyageur doit obligatoirement renseigner sa fiche individuelle de police avant son entrée dans les lieux.

⚡ ENREGISTREMENT RAPIDE EN LIGNE (30 secondes) :
Pour vous éviter toute attente à votre arrivée, complétez directement votre fiche en ligne :
🔗 Lien direct : ${portalUrl}
🔑 Votre code d'accès : ${accessCode}

💡 ZÉRO FORMULAIRE FASTIDIEUX :
• Vous n'avez aucune adresse à taper : photographiez simplement votre passeport ou carte d'identité (notre IA extrait automatiquement vos informations).
• Vous êtes plusieurs ? Ajoutez facilement tous vos accompagnateurs sur la même fiche.
• Une seule signature numérique pour tout le groupe !

Au grand plaisir de vous recevoir très bientôt.
${hostName ? `Chaleureusement,\n${hostName}` : "L'équipe de l'hébergement"}`;

  const msgEn = `Hello ${name}! 🇲🇦

Welcome to ${propertyName || 'our accommodation'}${city ? ` (${city})` : ''}! We are delighted to host you for your stay${datesEn}.

📋 MOROCCAN TOURISM REGULATION (Police Declaration):
In accordance with Moroccan legal requirements, all visitors must register their official police declaration form ("Fiche de Police") prior to check-in.

⚡ 30-SECOND FAST ONLINE CHECK-IN:
To ensure a smooth arrival with zero delays, please register directly through our secure guest portal:
🔗 Direct Link: ${portalUrl}
🔑 Your Access Code: ${accessCode}

💡 ZERO HASSLE - NO TYPING REQUIRED:
• No long forms or addresses to type: simply scan/upload your passport or national ID (our AI automatically captures your details).
• Traveling with companions? Easily add all guests onto the same form.
• One single digital signature on screen for the entire group!

Looking forward to welcoming you soon!
${hostName ? `Warm regards,\n${hostName}` : "Host Team"}`;

  if (language === 'en') {
    return msgEn;
  } else if (language === 'bilingual') {
    return `${msgFr}\n\n------------------------------\n🇬🇧 (English version below)\n\n${msgEn}`;
  }
  return msgFr;
}


/**
 * Test Hospitable API connection with Personal Access Token
 */
export async function testHospitableConnection(apiKey) {
  if (!apiKey) throw new Error("Clé API Hospitable requise");

  try {
    const res = await fetch(`${HOSPITABLE_API_BASE}/properties`, {
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Erreur Hospitable (${res.status}): ${errBody || res.statusText}`);
    }

    const data = await res.json();
    return {
      success: true,
      propertiesCount: data.data?.length || 0,
      properties: data.data || []
    };
  } catch (err) {
    console.error("Hospitable connection test failed:", err);
    throw err;
  }
}

/**
 * Send an automated message directly to a guest on Airbnb or Booking.com via Hospitable API
 */
export async function sendHospitableMessage(apiKey, reservationId, messageBody) {
  if (!apiKey) throw new Error("Clé API Hospitable requise");
  if (!reservationId) throw new Error("Identifiant de réservation Hospitable requis");

  try {
    // Post message to reservation in Hospitable
    const res = await fetch(`${HOSPITABLE_API_BASE}/reservations/${reservationId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        body: messageBody
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      // Try fallback to conversations endpoint if reservation messages endpoint varies
      const convRes = await fetch(`${HOSPITABLE_API_BASE}/conversations/${reservationId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          body: messageBody
        })
      });

      if (!convRes.ok) {
        throw new Error(`Échec d'envoi du message via Hospitable: ${errText || res.statusText}`);
      }
      return await convRes.json();
    }

    return await res.json();
  } catch (err) {
    console.error("Error sending Hospitable message:", err);
    throw err;
  }
}

/**
 * Pull reservations from Hospitable API into local database
 */
export async function syncHospitableReservations(apiKey, propertyId, baseUrl) {
  if (!apiKey) throw new Error("Clé API Hospitable requise");

  const db = readDB();
  const property = db.properties.find(p => p.id === propertyId);
  if (!property) throw new Error("Hébergement local non trouvé");

  try {
    const res = await fetch(`${HOSPITABLE_API_BASE}/reservations?include=guest`, {
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Erreur API Hospitable (${res.status})`);
    }

    const json = await res.json();
    const reservations = json.data || [];
    let addedCount = 0;

    for (const r of reservations) {
      const externalUid = `hospitable_${r.id || r.code}`;
      const checkIn = r.start_date || r.check_in;
      const checkOut = r.end_date || r.check_out;
      const guestName = r.guest ? `${r.guest.first_name || ''} ${r.guest.last_name || ''}`.trim() : (r.guest_name || 'Voyageur Hospitable');
      const platform = (r.platform || r.channel || 'airbnb').toLowerCase();

      // Check if already exists in DB
      const existing = db.bookings.find(b => b.externalUid === externalUid || (r.code && b.externalUid?.includes(r.code)));
      if (!existing && checkIn && checkOut) {
        const newBooking = {
          id: `bkg_hosp_${r.id || Date.now()}`,
          propertyId: property.id,
          source: platform.includes('booking') ? 'booking' : 'airbnb',
          guestName: guestName || 'Voyageur Hospitable',
          guestEmail: r.guest?.email || '',
          guestPhone: r.guest?.phone || '',
          checkIn,
          checkOut,
          status: 'confirmed',
          totalPrice: r.payout_price?.amount || null,
          currency: r.payout_price?.currency || 'MAD',
          notes: `Importé via Hospitable (Réf: ${r.code || r.id}, Plateforme: ${platform})`,
          externalUid,
          hospitableReservationId: r.id || null,
          createdAt: new Date().toISOString()
        };

        db.bookings.push(newBooking);

        // Generate police registration code automatically
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const portalUrl = `${baseUrl || 'http://localhost:3000'}/?guestCode=${code}`;
        const autoMessage = generateFullAutomatedMessage({
          guestName,
          propertyName: property.name,
          city: property.city,
          accessCode: code,
          portalUrl,
          hostName: property.hostName
        });

        db.policeRegistrations.push({
          id: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          accessCode: code,
          propertyId: property.id,
          bookingId: newBooking.id,
          hospitableReservationId: r.id || null,
          guestName: newBooking.guestName,
          guestPhone: newBooking.guestPhone,
          status: 'pending',
          expiresAt: new Date(new Date(checkOut).getTime() + 86400000 * 2).toISOString(),
          automatedMessage: autoMessage,
          messageSentAt: null,
          guestDetails: null,
          idDocumentPath: null,
          signaturePath: null,
          pdfPath: null,
          createdAt: new Date().toISOString(),
          completedAt: null
        });

        addedCount++;
      }
    }

    writeDB(db);
    return {
      success: true,
      totalReceived: reservations.length,
      newBookingsAdded: addedCount
    };
  } catch (err) {
    console.error("Error syncing Hospitable reservations:", err);
    throw err;
  }
}

/**
 * Handle incoming webhook from Hospitable (reservation.created / reservation.updated)
 * Automatically creates portal, generates code, and sends full message!
 */
export async function handleHospitableWebhook(body, baseUrl, apiKey) {
  const db = readDB();
  const event = body.event || body.type;
  const reservation = body.data?.reservation || body.data;

  if (!reservation) {
    return { success: false, message: "Données de réservation absentes" };
  }

  const externalUid = `hospitable_${reservation.id || reservation.code}`;
  const checkIn = reservation.start_date || reservation.check_in;
  const checkOut = reservation.end_date || reservation.check_out;
  const guestName = reservation.guest ? `${reservation.guest.first_name || ''} ${reservation.guest.last_name || ''}`.trim() : (reservation.guest_name || 'Voyageur Hospitable');
  const platform = (reservation.platform || reservation.channel || 'airbnb').toLowerCase();

  const property = db.properties[0];
  if (!property) return { success: false, message: "Aucun logement local configuré" };

  const existingIdx = db.bookings.findIndex(b => b.externalUid === externalUid);

  let bookingId = null;
  if (existingIdx >= 0) {
    db.bookings[existingIdx].checkIn = checkIn;
    db.bookings[existingIdx].checkOut = checkOut;
    db.bookings[existingIdx].guestName = guestName || db.bookings[existingIdx].guestName;
    bookingId = db.bookings[existingIdx].id;
  } else {
    bookingId = `bkg_hosp_${reservation.id || Date.now()}`;
    const newBooking = {
      id: bookingId,
      propertyId: property.id,
      source: platform.includes('booking') ? 'booking' : 'airbnb',
      guestName: guestName || 'Voyageur Hospitable',
      guestEmail: reservation.guest?.email || '',
      guestPhone: reservation.guest?.phone || '',
      checkIn,
      checkOut,
      status: 'confirmed',
      totalPrice: reservation.payout_price?.amount || null,
      currency: reservation.payout_price?.currency || 'MAD',
      notes: `Webhook Hospitable: ${event} (${platform})`,
      externalUid,
      hospitableReservationId: reservation.id || null,
      createdAt: new Date().toISOString()
    };
    db.bookings.push(newBooking);
  }

  // Create or retrieve police pass with access code & full automated message
  let reg = db.policeRegistrations.find(r => r.bookingId === bookingId);
  const code = reg ? reg.accessCode : Math.floor(100000 + Math.random() * 900000).toString();
  const portalUrl = `${baseUrl || 'http://localhost:3000'}/?guestCode=${code}`;
  
  const fullMessage = generateFullAutomatedMessage({
    guestName,
    propertyName: property.name,
    city: property.city,
    accessCode: code,
    portalUrl,
    hostName: property.hostName
  });

  if (!reg) {
    reg = {
      id: `reg_${Date.now()}`,
      accessCode: code,
      propertyId: property.id,
      bookingId: bookingId,
      hospitableReservationId: reservation.id || null,
      guestName: guestName,
      guestPhone: reservation.guest?.phone || '',
      status: 'pending',
      expiresAt: new Date(new Date(checkOut).getTime() + 86400000 * 2).toISOString(),
      automatedMessage: fullMessage,
      messageSentAt: null,
      guestDetails: null,
      idDocumentPath: null,
      signaturePath: null,
      pdfPath: null,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    db.policeRegistrations.push(reg);
  } else {
    reg.automatedMessage = fullMessage;
  }

  // Automatically dispatch message through Hospitable API if API key is provided
  let autoSent = false;
  if (apiKey && reservation.id) {
    try {
      await sendHospitableMessage(apiKey, reservation.id, fullMessage);
      reg.messageSentAt = new Date().toISOString();
      autoSent = true;
      console.log(`[Hospitable Auto-Message] Message sent automatically to ${guestName} on ${platform}`);
    } catch (msgErr) {
      console.warn("[Hospitable Auto-Message] Could not auto-send via API:", msgErr.message);
    }
  }

  writeDB(db);
  return { 
    success: true, 
    message: `Réservation et portail créés pour ${guestName}. Code: ${code}. Message auto-envoyé: ${autoSent ? 'Oui' : 'Non'}` 
  };
}
