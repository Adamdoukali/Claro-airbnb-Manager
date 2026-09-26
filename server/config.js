import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env first, then a root .env as a fallback (both optional).
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name, value) {
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) required('JWT_SECRET', jwtSecret);
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET absent : un secret temporaire est utilisé (les sessions expirent au redémarrage).');
}

const supabaseUrl = (env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export const config = {
  serverDir: __dirname,
  port: Number(env.PORT) || 5000,
  isProd,
  // Vercel / AWS Lambda: read-only filesystem, several instances, no persistent disk.
  isServerless: Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME),

  // Public URL of the deployed app (used in guest links / webhook URL). Optional.
  appUrl: (env.APP_URL || '').replace(/\/+$/, ''),

  // Auth
  jwtSecret,
  sessionDays: Number(env.SESSION_DAYS) || 7,
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',

  // Supabase (Postgres + Storage). When absent, a local JSON file + disk are used.
  supabaseUrl,
  supabaseServiceKey,
  supabaseBucket: env.SUPABASE_BUCKET || 'claro-files',
  useSupabase: Boolean(supabaseUrl && supabaseServiceKey),

  // Hospitable
  hospitableApiKey: env.HOSPITABLE_API_KEY || '',
  hospitableWebhookSecret: env.HOSPITABLE_WEBHOOK_SECRET || '',

  // Scheduler. On Vercel, Cron Jobs call GET /api/automation/run with "Bearer CRON_SECRET".
  // On a long-running server an internal timer runs every AUTOMATION_INTERVAL_MINUTES (0 = off,
  // default 60 in production and off in development).
  cronSecret: (env.CRON_SECRET || '').trim(),
  automationIntervalMinutes: env.AUTOMATION_INTERVAL_MINUTES !== undefined
    ? Math.max(0, Number(env.AUTOMATION_INTERVAL_MINUTES) || 0)
    : (isProd ? 60 : 0),

  // Optional explicit browser binary for HTML -> PDF rendering
  chromePath: env.CHROME_PATH || '',

  // Extra allowed CORS origins (comma separated). Same-origin always works.
  corsOrigins: (env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
};

export default config;
