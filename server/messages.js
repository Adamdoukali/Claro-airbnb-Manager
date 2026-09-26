import { formatDateFr } from './utils.js';

/**
 * Build the personalized check-in message sent to a guest (French, English or bilingual).
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
  const datesFr = checkIn && checkOut ? ` du ${formatDateFr(checkIn)} au ${formatDateFr(checkOut)}` : '';
  const datesEn = checkIn && checkOut ? ` from ${checkIn} to ${checkOut}` : '';
  const place = `${propertyName || 'notre hébergement'}${city ? ` (${city})` : ''}`;
  const placeEn = `${propertyName || 'our accommodation'}${city ? ` (${city})` : ''}`;

  const msgFr = `Bonjour ${name} ! 🇲🇦

Bienvenue à ${place} ! Nous avons hâte de vous accueillir pour votre séjour${datesFr}.

📋 ENREGISTREMENT DES VOYAGEURS (obligatoire au Maroc) :
Conformément à la réglementation marocaine en vigueur, chaque voyageur doit être enregistré avant son entrée dans les lieux.

⚡ ENREGISTREMENT RAPIDE EN LIGNE (30 secondes) :
🔗 Lien direct : ${portalUrl}
🔑 Votre code d'accès : ${accessCode}

💡 ZÉRO FORMULAIRE FASTIDIEUX :
• Photographiez simplement votre passeport ou pièce d'identité (extraction automatique).
• Vous voyagez en groupe ? Ajoutez tous vos accompagnateurs sur la même fiche.
• Signature électronique en 1 clic sur votre écran.

Au plaisir de vous recevoir très bientôt !
${hostName ? `Chaleureusement,\n${hostName}` : "L'équipe de l'hébergement"}`;

  const msgEn = `Hello ${name}! 🇲🇦

Welcome to ${placeEn}! We are delighted to host you for your stay${datesEn}.

📋 GUEST REGISTRATION (mandatory in Morocco):
In accordance with Moroccan legal requirements, every guest must be registered before check-in.

⚡ 30-SECOND ONLINE CHECK-IN:
🔗 Direct link: ${portalUrl}
🔑 Your access code: ${accessCode}

💡 NO TYPING REQUIRED:
• Simply take a photo of your passport or national ID (details are extracted automatically).
• Travelling with companions? Add every guest on the same form.
• One digital signature on screen for the whole group.

Looking forward to welcoming you soon!
${hostName ? `Warm regards,\n${hostName}` : 'Host team'}`;

  if (language === 'en') return msgEn;
  if (language === 'bilingual') {
    return `${msgFr}\n\n------------------------------\n🇬🇧 English version\n\n${msgEn}`;
  }
  return msgFr;
}

/**
 * Short reminder sent when the police form is still pending a few days before arrival.
 */
export function generateReminderMessage({ guestName, propertyName, accessCode, portalUrl, checkIn, hostName, language = 'fr' }) {
  const name = guestName ? guestName.split(' ')[0] : '';
  const place = propertyName || 'votre hébergement';
  const placeEn = propertyName || 'your accommodation';

  const msgFr = `Bonjour${name ? ` ${name}` : ''} ! 👋

Petit rappel avant votre arrivée à ${place}${checkIn ? ` le ${formatDateFr(checkIn)}` : ''} : votre enregistrement voyageur (obligatoire au Maroc) n'est pas encore complété.

⚡ 30 secondes suffisent :
🔗 ${portalUrl}
🔑 Code d'accès : ${accessCode}

Merci et à très bientôt !
${hostName || "L'équipe de l'hébergement"}`;

  const msgEn = `Hello${name ? ` ${name}` : ''}! 👋

Quick reminder before your arrival at ${placeEn}${checkIn ? ` on ${checkIn}` : ''}: your online guest registration (mandatory in Morocco) has not been completed yet.

⚡ It only takes 30 seconds:
🔗 ${portalUrl}
🔑 Access code: ${accessCode}

Thank you and see you soon!
${hostName || 'Host team'}`;

  if (language === 'en') return msgEn;
  if (language === 'bilingual') return `${msgFr}\n\n------------------------------\n🇬🇧\n\n${msgEn}`;
  return msgFr;
}
