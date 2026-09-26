import crypto from 'crypto';
import { config } from './config.js';

/** Public base URL used in guest links (APP_URL, else the request origin). */
export function getBaseUrl(req) {
  if (config.appUrl) return config.appUrl;
  if (req.headers.origin) return req.headers.origin;
  return `${req.protocol}://${req.get('host')}`;
}

export function portalUrl(baseUrl, code) {
  return `${baseUrl}/?guestCode=${encodeURIComponent(code)}`;
}

export function newId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Unique 6-digit guest access code. */
export function generateAccessCode(existingRegistrations = []) {
  const taken = new Set(existingRegistrations.map(r => String(r.accessCode)));
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!taken.has(code)) return code;
  }
  return String(crypto.randomInt(100000, 1000000)) + crypto.randomInt(0, 10);
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function pick(obj, fields) {
  const out = {};
  for (const f of fields) {
    if (obj[f] !== undefined) out[f] = obj[f];
  }
  return out;
}

export function str(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wrap async route handlers so rejected promises reach the error middleware. */
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** True when two [checkIn, checkOut) ranges overlap. */
export function datesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

export function formatDateFr(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
