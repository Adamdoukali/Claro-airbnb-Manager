import rateLimit from 'express-rate-limit';
import multer from 'multer';

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans quelques minutes.' }
};

/** Login: 15 failed attempts per 15 minutes per IP (successful logins are not counted). */
export const loginLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

/** Public guest portal (verify / submit): 60 per 15 minutes per IP. */
export const guestLimiter = rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, limit: 60 });

/** OCR is CPU heavy: 20 scans per 15 minutes per IP. */
export const ocrLimiter = rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, limit: 20 });

/** Webhook endpoint: 120 per minute per IP. */
export const webhookLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 1000, limit: 120 });

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Uploads stay in memory and are handed to the storage adapter (disk or Supabase). */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    fieldSize: 30 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    const err = new Error('Format de fichier non supporté (JPEG, PNG ou WebP uniquement).');
    err.status = 400;
    cb(err);
  }
});

/** Central error handler: consistent JSON errors, no stack traces leaked. */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error('[api]', err);
  // Never echo internal details (database / upstream errors, stack hints) to the client.
  const message = status >= 500 ? 'Erreur serveur, réessayez dans un instant.' : (err.message || 'Requête invalide');
  res.status(status).json({ error: message });
}

/** The declared MIME type comes from the client: check the real file signature too. */
export function isRealImage(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const b = buffer;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return false;
}

/** Multer post-check: rejects files whose bytes are not a JPEG / PNG / WebP image. */
export function requireRealImage(req, res, next) {
  if (req.file && !isRealImage(req.file.buffer)) {
    return res.status(400).json({ error: "Le fichier n'est pas une image valide (JPEG, PNG ou WebP)." });
  }
  next();
}
