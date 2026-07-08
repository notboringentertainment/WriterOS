// Writers' Room — boxed Supabase client. THE ONLY place @supabase/supabase-js
// is imported. Server-side only: the key lives in .env and must never reach
// the client bundle (no VITE_ prefix, ever).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function isRoomConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export function getRoomDb(): SupabaseClient {
  if (!isRoomConfigured()) {
    throw new Error('Writers Room is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY');
  }
  if (!cached) {
    cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  }
  return cached;
}

// Test seam: lets tests inject a fake client without env vars.
export function __setRoomDbForTests(client: SupabaseClient | null): void {
  cached = client;
}
