import { formatDateFr } from './utils.js';

/**
 * Build the check-in message sent to a guest (French, English or bilingual).
 * Wording supplied by the host (2026-10-03): ID requirements, check-in form, confidentiality,
 * authorized occupants, proof of marriage where applicable, consequences of false declarations.
 * The portal link and the access code are always included.
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
  const name = guestName ? guestName.split(' ')[0] : '';
  const datesFr = checkIn && checkOut ? ` du ${formatDateFr(checkIn)} au ${formatDateFr(checkOut)}` : '';
  const datesEn = checkIn && checkOut ? ` from ${checkIn} to ${checkOut}` : '';
  const place = `${propertyName || 'notre hébergement'}${city ? ` (${city})` : ''}`;
  const placeEn = `${propertyName || 'our accommodation'}${city ? ` (${city})` : ''}`;
  const signFr = hostName ? `Cordialement,\n${hostName}` : "L'équipe de l'hébergement";
  const signEn = hostName ? `Kind regards,\n${hostName}` : 'The host team';

  const msgEn = `Hello${name ? ` ${name}` : ''}, welcome to ${placeEn}${datesEn}.

In accordance with applicable regulations in Morocco, all guests must provide a valid ID before arrival:
🌍 Foreign guests: valid passport required
🇲🇦 Moroccan guests: valid Moroccan National ID Card (CIN) required
Guests must also complete the check-in form using the link below before arrival.
🔐 The information and documents provided are used only for the required registration formalities and are treated confidentially.

🔗 Check-in form: ${portalUrl}
🔑 Your access code: ${accessCode}

⚠️ Important:
Only guests confirmed on the reservation and registered in the check-in form are allowed to access the property.
No outside visitors or unregistered guests are permitted.
The persons entered in the form will be considered the only authorized occupants during the stay.
By completing the form, each guest confirms that all information provided is accurate and that they comply with the accommodation requirements applicable to the property.
Where applicable, proof of marriage may be requested before arrival.
If no additional supporting document is requested or provided, guests remain responsible for ensuring that their situation complies with the accommodation conditions and with the information declared during check-in.
Any false declaration or failure to comply with these requirements may result in refusal of access to the property.

${signEn}`;

  const msgFr = `Bonjour${name ? ` ${name}` : ''}, bienvenue à ${place}${datesFr}.

Conformément à la réglementation en vigueur au Maroc, chaque voyageur doit présenter une pièce d'identité valide avant son arrivée :
🌍 Voyageurs étrangers : passeport en cours de validité
🇲🇦 Voyageurs marocains : carte nationale d'identité (CIN) en cours de validité
Les voyageurs doivent également compléter le formulaire de check-in via le lien ci-dessous avant leur arrivée.
🔐 Les informations et documents fournis servent uniquement aux formalités d'enregistrement obligatoires et sont traités de manière confidentielle.

🔗 Formulaire de check-in : ${portalUrl}
🔑 Votre code d'accès : ${accessCode}

⚠️ Important :
Seuls les voyageurs confirmés sur la réservation et enregistrés dans le formulaire de check-in sont autorisés à accéder au logement.
Aucun visiteur extérieur ni voyageur non enregistré n'est admis.
Les personnes renseignées dans le formulaire seront considérées comme les seuls occupants autorisés pendant le séjour.
En complétant le formulaire, chaque voyageur confirme que les informations fournies sont exactes et qu'il respecte les conditions d'hébergement applicables au logement.
Le cas échéant, un justificatif de mariage pourra être demandé avant l'arrivée.
Si aucun justificatif supplémentaire n'est demandé ou fourni, les voyageurs restent responsables de la conformité de leur situation avec les conditions d'hébergement et avec les informations déclarées lors du check-in.
Toute fausse déclaration ou tout manquement à ces exigences pourra entraîner un refus d'accès au logement.

${signFr}`;

  if (language === 'en') return msgEn;
  if (language === 'bilingual') {
    return `${msgFr}\n\n------------------------------\n🇬🇧 English version\n\n${msgEn}`;
  }
  return msgFr;
}

/**
 * Short reminder sent when the check-in form is still pending a few days before arrival.
 */
export function generateReminderMessage({ guestName, propertyName, accessCode, portalUrl, checkIn, hostName, language = 'fr' }) {
  const name = guestName ? guestName.split(' ')[0] : '';
  const place = propertyName || 'votre hébergement';
  const placeEn = propertyName || 'your accommodation';

  const msgFr = `Bonjour${name ? ` ${name}` : ''} ! 👋

Petit rappel avant votre arrivée à ${place}${checkIn ? ` le ${formatDateFr(checkIn)}` : ''} : votre formulaire de check-in (obligatoire au Maroc, pièce d'identité valide pour chaque voyageur) n'est pas encore complété.

⚡ 30 secondes suffisent :
🔗 ${portalUrl}
🔑 Code d'accès : ${accessCode}

Merci et à très bientôt !
${hostName || "L'équipe de l'hébergement"}`;

  const msgEn = `Hello${name ? ` ${name}` : ''}! 👋

Quick reminder before your arrival at ${placeEn}${checkIn ? ` on ${checkIn}` : ''}: your check-in form (mandatory in Morocco, valid ID for every guest) has not been completed yet.

⚡ It only takes 30 seconds:
🔗 ${portalUrl}
🔑 Access code: ${accessCode}

Thank you and see you soon!
${hostName || 'The host team'}`;

  if (language === 'en') return msgEn;
  if (language === 'bilingual') return `${msgFr}\n\n------------------------------\n🇬🇧\n\n${msgEn}`;
  return msgFr;
}
