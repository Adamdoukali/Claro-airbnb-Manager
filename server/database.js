import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from './config.js';
import { getSupabase } from './supabaseClient.js';
import { DEFAULT_AUTOMATION, normalizeAutomation } from './automation.js';

const DB_FILE = path.join(config.serverDir, 'data.json');

// Collections stored as one row per record (id + jsonb) in Supabase,
// or as arrays in data.json in local mode.
const COLLECTIONS = {
  properties: 'properties',
  bookings: 'bookings',
  policeRegistrations: 'police_registrations',
  syncLogs: 'sync_logs'
};

export const DEFAULT_GUEST_OFFER = {
  enabled: true,
  title: 'Besoin d\'une voiture pendant votre séjour ?',
  agencyName: 'Agence Intissar',
  description: 'Notre agence partenaire à Tanger propose des voitures de location à tarif préférentiel pour nos voyageurs. Contactez-la directement en mentionnant votre logement.',
  mapsUrl: 'https://maps.app.goo.gl/q7zKGy88VELuawqW6',
  phone: '+212 6 14 16 88 95',
  whatsapp: '+212 6 14 16 88 95'
};

export const DEFAULT_SETTINGS = {
  hospitableApiKey: '',
  defaultLanguage: 'fr', // 'fr' | 'en' | 'bilingual'
  lastGlobalSync: null,
  hospitableConnected: false,
  agencyName: '',
  agencyAddress: '',
  agencySubAddress: '',
  agencyCity: '',
  agencyPhone: '',
  agencyIce: '',
  // Every automated action is opt-in (see automation.js). Controlled from the "Paramètres" panel.
  automation: { ...DEFAULT_AUTOMATION },
  // Recommendation card shown to guests on the final "thank you" page (car rental partner).
  guestOffer: { ...DEFAULT_GUEST_OFFER }
};


/** Merge stored settings over the defaults (nested `automation` included). */
export function normalizeSettings(raw = {}) {
  const { autoSendPoliceMessage, ...rest } = raw || {};
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    automation: normalizeAutomation(rest.automation),
    guestOffer: { ...DEFAULT_GUEST_OFFER, ...(rest.guestOffer && typeof rest.guestOffer === 'object' ? rest.guestOffer : {}) }
  };
}

function emptyState() {
  return {
    settings: normalizeSettings({}),
    properties: [],
    bookings: [],
    policeRegistrations: [],
    syncLogs: [],
    users: []
  };
}

let state = null;
let lastLoadedAt = 0;
let inflightRefresh = null;
let writeChain = Promise.resolve();

// Each loaded dataset remembers what it looked like when it was read/persisted, so a write
// only touches rows that *this* dataset changed. In serverless mode several instances (or an
// in-flight request holding an older dataset) can coexist without deleting each other's rows.
const snapshots = new WeakMap();

function snapshotOf(db) {
  const snap = {};
  for (const key of Object.keys(COLLECTIONS)) {
    snap[key] = new Map(db[key].map(r => [r.id, JSON.stringify(r)]));
  }
  snap.settings = JSON.stringify(db.settings);
  return snap;
}

// ---------------------------------------------------------------------------
// Local JSON file backend
// ---------------------------------------------------------------------------
function loadFromFile() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = emptyState();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    return { ...emptyState(), ...parsed, settings: normalizeSettings(parsed.settings) };
  } catch (err) {
    console.error('[db] data.json illisible, démarrage avec une base vide :', err.message);
    return emptyState();
  }
}

function saveToFile(db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmp, DB_FILE);
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------
async function loadFromSupabase() {
  const sb = getSupabase();
  const fresh = emptyState();

  const collectionQueries = Object.entries(COLLECTIONS).map(async ([key, table]) => {
    const { data, error } = await sb.from(table).select('id,data').order('created_at', { ascending: true });
    if (error) throw new Error(`Table "${table}" : ${error.message} (exécutez supabase/schema.sql)`);
    fresh[key] = (data || []).map(row => ({ ...row.data, id: row.id }));
  });

  const settingsQuery = (async () => {
    const { data, error } = await sb.from('settings').select('data').eq('id', 'global').maybeSingle();
    if (error) throw new Error(`Table "settings" : ${error.message}`);
    fresh.settings = normalizeSettings(data?.data);
  })();

  const usersQuery = (async () => {
    const { data, error } = await sb.from('users').select('id,email,password_hash,role,created_at');
    if (error) throw new Error(`Table "users" : ${error.message}`);
    fresh.users = (data || []).map(u => ({
      id: u.id, email: u.email, passwordHash: u.password_hash, role: u.role, createdAt: u.created_at
    }));
  })();

  await Promise.all([...collectionQueries, settingsQuery, usersQuery]);
  return fresh;
}

async function persistToSupabase(db) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const prevSnap = snapshots.get(db) || {};

  for (const [key, table] of Object.entries(COLLECTIONS)) {
    const prev = prevSnap[key] || new Map();
    const current = new Set();
    const upserts = [];

    for (const record of db[key]) {
      const json = JSON.stringify(record);
      current.add(record.id);
      if (prev.get(record.id) !== json) {
        upserts.push({ id: record.id, data: record, updated_at: now });
      }
    }
    const deletes = [...prev.keys()].filter(id => !current.has(id));

    if (upserts.length) {
      const { error } = await sb.from(table).upsert(upserts, { onConflict: 'id' });
      if (error) throw new Error(`Écriture "${table}" : ${error.message}`);
    }
    if (deletes.length) {
      const { error } = await sb.from(table).delete().in('id', deletes);
      if (error) throw new Error(`Suppression "${table}" : ${error.message}`);
    }
  }

  if (prevSnap.settings !== JSON.stringify(db.settings)) {
    const { error } = await sb.from('settings').upsert({ id: 'global', data: db.settings, updated_at: now });
    if (error) throw new Error(`Écriture "settings" : ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load the whole dataset into memory. Must be awaited before serving requests. */
export async function initDB() {
  if (state) return state;
  if (config.useSupabase) {
    state = await loadFromSupabase();
    console.log(`[db] Supabase connecté (${state.properties.length} logements, ${state.bookings.length} réservations).`);
  } else {
    state = loadFromFile();
    console.log('[db] Mode local : server/data.json');
  }
  snapshots.set(state, snapshotOf(state));
  lastLoadedAt = Date.now();
  return state;
}

/**
 * Re-read the dataset from Supabase (no-op in local mode). Called at the start of each
 * request in serverless deployments where several instances share the database.
 */
export async function refreshDB({ maxAgeMs = 1000 } = {}) {
  if (!config.useSupabase) return state;
  if (Date.now() - lastLoadedAt < maxAgeMs) return state;
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      // Never interleave a reload with a pending write from this instance.
      await writeChain.catch(() => {});
      const fresh = await loadFromSupabase();
      snapshots.set(fresh, snapshotOf(fresh));
      state = fresh;
      lastLoadedAt = Date.now();
      return state;
    })().finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

/** Returns the live in-memory dataset. Mutate it, then call writeDB(). */
export function readDB() {
  if (!state) throw new Error('Base non initialisée : appelez initDB() au démarrage');
  return state;
}

/** Persist a dataset (defaults to the current one). Writes are serialized. */
export function writeDB(db = state) {
  const target = db || state;
  writeChain = writeChain.then(async () => {
    if (config.useSupabase) {
      await persistToSupabase(target);
    } else {
      state = target;
      saveToFile(target);
    }
    snapshots.set(target, snapshotOf(target));
  });
  // Keep the chain alive even if one write fails, but surface the error to the caller.
  const result = writeChain;
  writeChain = writeChain.catch(() => {});
  return result;
}

export function getSettings() {
  return readDB().settings;
}

export async function updateSettings(patch) {
  const db = readDB();
  db.settings = normalizeSettings({ ...db.settings, ...patch });
  await writeDB(db);
  return db.settings;
}

// ---------------------------------------------------------------------------
// Users (auth). Kept separate because the Supabase table has real columns.
// ---------------------------------------------------------------------------
export function findUserByEmail(email) {
  const e = (email || '').trim().toLowerCase();
  return readDB().users.find(u => u.email === e) || null;
}

export function findUserById(id) {
  return readDB().users.find(u => u.id === id) || null;
}

export async function createUser({ email, passwordHash, role = 'admin' }) {
  const user = {
    id: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role,
    createdAt: new Date().toISOString()
  };
  if (config.useSupabase) {
    const { error } = await getSupabase().from('users').insert({
      id: user.id, email: user.email, password_hash: user.passwordHash, role: user.role, created_at: user.createdAt
    });
    if (error) throw new Error(`Création utilisateur : ${error.message}`);
    readDB().users.push(user);
  } else {
    readDB().users.push(user);
    await writeDB();
  }
  return user;
}

export async function updateUserPassword(userId, passwordHash) {
  const user = findUserById(userId);
  if (!user) throw new Error('Utilisateur introuvable');
  user.passwordHash = passwordHash;
  if (config.useSupabase) {
    const { error } = await getSupabase().from('users').update({ password_hash: passwordHash }).eq('id', userId);
    if (error) throw new Error(`Mise à jour mot de passe : ${error.message}`);
  } else {
    await writeDB();
  }
  return user;
}
