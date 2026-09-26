import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { getSupabase } from './supabaseClient.js';

/**
 * File storage for ID scans, signatures and generated PDFs.
 * Keys look like "uploads/doc_123.jpg" or "pdfs/bulletin_123.pdf".
 *  - Local mode: files live under server/<folder>/ (uploads -> server/uploads, pdfs -> server/generated_pdfs)
 *  - Supabase mode: files live in a private Storage bucket.
 */

const LOCAL_DIRS = {
  uploads: path.join(config.serverDir, 'uploads'),
  pdfs: path.join(config.serverDir, 'generated_pdfs')
};

const SAFE_KEY = /^(uploads|pdfs)\/[A-Za-z0-9._-]+$/;

export function isValidKey(key) {
  return typeof key === 'string' && SAFE_KEY.test(key);
}

function localPath(key) {
  const [folder, name] = key.split('/');
  return path.join(LOCAL_DIRS[folder], name);
}

export async function initStorage() {
  if (!config.useSupabase) {
    // Local mode only: serverless filesystems are read-only outside /tmp.
    for (const dir of Object.values(LOCAL_DIRS)) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }
  if (config.useSupabase) {
    const sb = getSupabase();
    const { error } = await sb.storage.createBucket(config.supabaseBucket, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Bucket Storage "${config.supabaseBucket}" : ${error.message}`);
    }
    console.log(`[storage] Supabase Storage bucket "${config.supabaseBucket}" prêt.`);
  } else {
    console.log('[storage] Mode local : server/uploads & server/generated_pdfs');
  }
}

export async function saveFile(folder, filename, buffer, contentType = 'application/octet-stream') {
  const key = `${folder}/${filename}`;
  if (!isValidKey(key)) throw new Error(`Clé de fichier invalide : ${key}`);

  if (config.useSupabase) {
    const { error } = await getSupabase().storage
      .from(config.supabaseBucket)
      .upload(key, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Upload Storage : ${error.message}`);
  } else {
    fs.writeFileSync(localPath(key), buffer);
  }
  return key;
}

export async function readFile(key) {
  if (!isValidKey(key)) return null;

  if (config.useSupabase) {
    const { data, error } = await getSupabase().storage.from(config.supabaseBucket).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const p = localPath(key);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

export async function deleteFile(key) {
  if (!isValidKey(key)) return;
  if (config.useSupabase) {
    await getSupabase().storage.from(config.supabaseBucket).remove([key]);
  } else {
    const p = localPath(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

export function mimeForKey(key) {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  return 'image/jpeg';
}
