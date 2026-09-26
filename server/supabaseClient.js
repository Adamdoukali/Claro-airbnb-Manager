import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let client = null;

/**
 * Server-side Supabase client (service role). Only created when Supabase is configured.
 * The service role key bypasses RLS, so it must never be shipped to the browser.
 */
export function getSupabase() {
  if (!config.useSupabase) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}
