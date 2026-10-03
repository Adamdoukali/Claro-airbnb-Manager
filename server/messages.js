import { formatDateFr } from './utils.js';
import { getSettings } from './database.js';

/**
 * Guest messages are built from four parts:
 *   greeting  (name, property, dates)        -> always generated
 *   body      (the host's wording)           -> editable as plain text ("simple" mode)
 *   link block (form link + access code)     -> always generated
 *   signature (host name)                    -> always generated
 *
 * Hosts can either edit the body as plain text (no placeholders at all) or, in advanced mode,
 * provide a full template with {{placeholders}}. Both are stored in settings.messageTemplates:
 *   fr / en / reminderFr / reminderEn               -> full templates (advanced)
 *   frBody / enBody / reminderFrBody / reminderEnBody -> plain-text bodies (simple)
 * A plain-text body wins over a full template when both exist. Empty = built-in text.
 */

export const MESSAGE_PLACEHOLDERS = [
  ['{{first_name}}', 'Prénom du voyageur'],
  ['{{guest_name}}', 'Nom complet du voyageur'],
  ['{{property_name}}', 'Nom du logement'],
  ['{{city}}', 'Ville'],
  ['{{check_in}}', "Date d'arrivée"],
  ['{{check_out}}', 'Date de départ'],
  ['{{portal_url}}', 'Lien du formulaire de check-in'],
  ['{{access_code}}', "Code d'accès"],
  ['{{host_name}}', "Nom de l'hôte"]
];

export const TEMPLATE_KEYS = ['fr', 'en', 'reminderFr', 'reminderEn', 'frBody', 'enBody', 'reminderFrBody', 'reminderEnBody'];

const isPh = v => String(v || '').startsWith('{{');

/** Custom templates saved in settings (empty string = built-in default). */
export function getMessageTemplates() {
  const t = getSettings().messageTemplates || {};
  const out = {};
  for (const k of TEMPLATE_KEYS) out[k] = t[k] || '';
  return out;
}

export function renderTemplate(template, vars) {
  let out = String(template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
  if (vars.portal_url && !out.includes(vars.portal_url)) {
    out += `\n\n🔗 ${vars.link_label} : ${vars.portal_url}\n🔑 ${vars.code_label} : ${vars.access_code}`;
  } else if (vars.access_code && !out.includes(String(vars.access_code))) {
    out += `\n🔑 ${vars.code_label} : ${vars.access_code}`;
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// Built-in parts
// ---------------------------------------------------------------------------
const DEFAULT_BODY_FR = `Conformément à la réglementation en vigueur au Maroc, chaque voyageur doit présenter une pièce d'identité valide avant son arrivée :
🌍 Voyageurs étrangers : passeport en cours de validité
🇲🇦 Voyageurs marocains : carte nationale d'identité (CIN) en cours de validité
Les voyageurs doivent également compléter le formulaire de check-in via le lien ci-dessous avant leur arrivée.
🔐 Les informations et documents fournis servent uniquement aux formalités d'enregistrement obligatoires et sont traités de manière confidentielle.`;

const DEFAULT_FOOTER_FR = `⚠️ Important :
Seuls les voyageurs confirmés sur la réservation et enregistrés dans le formulaire de check-in sont autorisés à accéder au logement.
Aucun visiteur extérieur ni voyageur non enregistré n'est admis.
Les personnes renseignées dans le formulaire seront considérées comme les seuls occupants autorisés pendant le séjour.
En complétant le formulaire, chaque voyageur confirme que les informations fournies sont exactes et qu'il respecte les conditions d'hébergement applicables au logement.
Le cas échéant, un justificatif de mariage pourra être demandé avant l'arrivée.
Si aucun justificatif supplémentaire n'est demandé ou fourni, les voyageurs restent responsables de la conformité de leur situation avec les conditions d'hébergement et avec les informations déclarées lors du check-in.
Toute fausse déclaration ou tout manquement à ces exigences pourra entraîner un refus d'accès au logement.`;

const DEFAULT_BODY_EN = `In accordance with applicable regulations in Morocco, all guests must provide a valid ID before arrival:
🌍 Foreign guests: valid passport required
🇲🇦 Moroccan guests: valid Moroccan National ID Card (CIN) required
Guests must also complete the check-in form using the link below before arrival.
🔐 The information and documents provided are used only for the required registration formalities and are treated confidentially.`;

const DEFAULT_FOOTER_EN = `⚠️ Important:
Only guests confirmed on the reservation and registered in the check-in form are allowed to access the property.
No outside visitors or unregistered guests are permitted.
The persons entered in the form will be considered the only authorized occupants during the stay.
By completing the form, each guest confirms that all information provided is accurate and that they comply with the accommodation requirements applicable to the property.
Where applicable, proof of marriage may be requested before arrival.
If no additional supporting document is requested or provided, guests remain responsible for ensuring that their situation complies with the accommodation conditions and with the information declared during check-in.
Any false declaration or failure to comply with these requirements may result in refusal of access to the property.`;

/** The built-in bodies as plain text (what the simple editor shows). */
export function defaultBodies() {
  return {
    frBody: `${DEFAULT_BODY_FR}\n\n{{link_block}}\n\n${DEFAULT_FOOTER_FR}`,
    enBody: `${DEFAULT_BODY_EN}\n\n{{link_block}}\n\n${DEFAULT_FOOTER_EN}`,
    reminderFrBody: 'Votre formulaire de check-in (obligatoire au Maroc, pièce d\'identité valide pour chaque voyageur) n\'est pas encore complété.\n\n⚡ 30 secondes suffisent :',
    reminderEnBody: 'Your check-in form (mandatory in Morocco, valid ID for every guest) has not been completed yet.\n\n⚡ It only takes 30 seconds:'
  };
}

function parts({ guestName, propertyName, city, accessCode, portalUrl, hostName, checkIn, checkOut }, lang) {
  const first = guestName ? (isPh(guestName) ? '{{first_name}}' : guestName.split(' ')[0]) : '';
  const fmt = d => (isPh(d) ? d : formatDateFr(d));
  const en = lang === 'en';
  const place = `${propertyName || (en ? 'our accommodation' : 'notre hébergement')}${city ? ` (${city})` : ''}`;
  const dates = checkIn && checkOut
    ? (en ? ` from ${checkIn} to ${checkOut}` : ` du ${fmt(checkIn)} au ${fmt(checkOut)}`)
    : '';
  return {
    greeting: en ? `Hello${first ? ` ${first}` : ''}, welcome to ${place}${dates}.` : `Bonjour${first ? ` ${first}` : ''}, bienvenue à ${place}${dates}.`,
    reminderGreeting: en ? `Hello${first ? ` ${first}` : ''}! 👋` : `Bonjour${first ? ` ${first}` : ''} ! 👋`,
    reminderIntro: en
      ? `Quick reminder before your arrival at ${propertyName || 'your accommodation'}${checkIn ? ` on ${checkIn}` : ''}:`
      : `Petit rappel avant votre arrivée à ${propertyName || 'votre hébergement'}${checkIn ? ` le ${fmt(checkIn)}` : ''} :`,
    linkBlock: en
      ? `🔗 Check-in form: ${portalUrl}\n🔑 Your access code: ${accessCode}`
      : `🔗 Formulaire de check-in : ${portalUrl}\n🔑 Votre code d'accès : ${accessCode}`,
    reminderLinkBlock: en ? `🔗 ${portalUrl}\n🔑 Access code: ${accessCode}` : `🔗 ${portalUrl}\n🔑 Code d'accès : ${accessCode}`,
    // Signed "your host" + the listing title (the name guests know from Airbnb / Booking)
    signature: en ? `Your host,\n${propertyName || 'The host team'}` : `Votre hôte,\n${propertyName || "L'équipe de l'hébergement"}`,
    reminderSignature: en ? `Thank you and see you soon!\nYour host, ${propertyName || 'The host team'}` : `Merci et à très bientôt !\nVotre hôte, ${propertyName || "L'équipe de l'hébergement"}`,
    vars: {
      first_name: first, guest_name: guestName || '', property_name: propertyName || '', city: city || '',
      check_in: en ? (checkIn || '') : fmt(checkIn), check_out: en ? (checkOut || '') : fmt(checkOut),
      portal_url: portalUrl, access_code: accessCode, host_name: hostName || '',
      link_label: en ? 'Check-in form' : 'Formulaire de check-in', code_label: en ? 'Your access code' : "Votre code d'accès"
    }
  };
}

/** Simple mode: plain body text; {{link_block}} marks where the link goes (else appended after the body). */
function assembleSimple(body, { greeting, linkBlock, signature }) {
  const text = String(body || '').trim();
  const withLink = text.includes('{{link_block}}')
    ? text.replace('{{link_block}}', linkBlock)
    : `${text}\n\n${linkBlock}`;
  return `${greeting}\n\n${withLink}\n\n${signature}`.trim();
}

function buildCheckin(input, lang, { ignoreCustom = false } = {}) {
  const p = parts(input, lang);
  const t = ignoreCustom ? {} : getMessageTemplates();
  const body = lang === 'en' ? t.enBody : t.frBody;
  const full = lang === 'en' ? t.en : t.fr;
  if (body) return assembleSimple(body, { greeting: p.greeting, linkBlock: p.linkBlock, signature: p.signature });
  if (full) return renderTemplate(full, p.vars);
  const defaults = defaultBodies();
  return assembleSimple(lang === 'en' ? defaults.enBody : defaults.frBody, { greeting: p.greeting, linkBlock: p.linkBlock, signature: p.signature });
}

function buildReminder(input, lang, { ignoreCustom = false } = {}) {
  const p = parts(input, lang);
  const t = ignoreCustom ? {} : getMessageTemplates();
  const body = lang === 'en' ? t.reminderEnBody : t.reminderFrBody;
  const full = lang === 'en' ? t.reminderEn : t.reminderFr;
  const greeting = `${p.reminderGreeting}\n\n${p.reminderIntro}`;
  if (body) return assembleSimple(body, { greeting, linkBlock: p.reminderLinkBlock, signature: p.reminderSignature });
  if (full) return renderTemplate(full, { ...p.vars, code_label: lang === 'en' ? 'Access code' : "Code d'accès" });
  const defaults = defaultBodies();
  return assembleSimple(lang === 'en' ? defaults.reminderEnBody : defaults.reminderFrBody, { greeting, linkBlock: p.reminderLinkBlock, signature: p.reminderSignature });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function generateFullAutomatedMessage({ language = 'fr', __ignoreCustom = false, ...input }) {
  const opts = { ignoreCustom: __ignoreCustom };
  if (language === 'en') return buildCheckin(input, 'en', opts);
  if (language === 'bilingual') return `${buildCheckin(input, 'fr', opts)}\n\n------------------------------\n🇬🇧 English version\n\n${buildCheckin(input, 'en', opts)}`;
  return buildCheckin(input, 'fr', opts);
}

export function generateReminderMessage({ language = 'fr', __ignoreCustom = false, ...input }) {
  const opts = { ignoreCustom: __ignoreCustom };
  if (language === 'en') return buildReminder(input, 'en', opts);
  if (language === 'bilingual') return `${buildReminder(input, 'fr', opts)}\n\n------------------------------\n🇬🇧\n\n${buildReminder(input, 'en', opts)}`;
  return buildReminder(input, 'fr', opts);
}

/**
 * Starting texts for the editors: plain bodies (simple mode) and full templates with
 * placeholder names (advanced mode).
 */
export function defaultMessageTemplates() {
  const sample = { guestName: '{{guest_name}}', propertyName: '{{property_name}}', city: '{{city}}', accessCode: '{{access_code}}', portalUrl: '{{portal_url}}', hostName: '{{host_name}}', checkIn: '{{check_in}}', checkOut: '{{check_out}}' };
  return {
    ...defaultBodies(),
    fr: generateFullAutomatedMessage({ ...sample, language: 'fr', __ignoreCustom: true }),
    en: generateFullAutomatedMessage({ ...sample, language: 'en', __ignoreCustom: true }),
    reminderFr: generateReminderMessage({ ...sample, language: 'fr', __ignoreCustom: true }),
    reminderEn: generateReminderMessage({ ...sample, language: 'en', __ignoreCustom: true })
  };
}

/** The fixed parts around a body, rendered with sample data for the simple editor. */
export function sampleParts(input, lang, kind = 'checkin') {
  const p = parts(input, lang);
  return kind === 'reminder'
    ? { greeting: `${p.reminderGreeting}\n\n${p.reminderIntro}`, linkBlock: p.reminderLinkBlock, signature: p.reminderSignature }
    : { greeting: p.greeting, linkBlock: p.linkBlock, signature: p.signature };
}
