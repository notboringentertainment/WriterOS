// Writers' Room — boxed Supabase client. THE ONLY place @supabase/supabase-js
// is imported. Server-side only: keys live in .env and must never reach the
// client bundle (no VITE_ prefix, ever).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

function roomKey(): string | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === 'production') return null;
  return process.env.SUPABASE_ANON_KEY || null;
}

export function isRoomConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && roomKey());
}

export function getRoomDb(): SupabaseClient {
  if (cached) return cached; // includes test-injected clients
  if (!isRoomConfigured()) {
    if (!process.env.SUPABASE_URL) {
      throw new Error('Writers Room is not configured: set SUPABASE_URL');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Writers Room production requires SUPABASE_SERVICE_ROLE_KEY; anon-key room access is disabled.');
    }
    throw new Error('Writers Room is not configured: set SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY for local development only.');
  }
  cached = createClient(process.env.SUPABASE_URL!, roomKey()!, {
    auth: { persistSession: false },
  });
  return cached;
}

// Test seam: lets tests inject a fake client without env vars.
export function __setRoomDbForTests(client: SupabaseClient | null): void {
  cached = client;
}
