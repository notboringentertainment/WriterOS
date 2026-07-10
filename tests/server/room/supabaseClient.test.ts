import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn(() => ({ from: vi.fn() })));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

const ORIGINAL_ENV = { ...process.env };

async function loadClientModule() {
  vi.resetModules();
  return import('../../../server/room/supabaseClient');
}

beforeEach(() => {
  createClientMock.mockClear();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('room Supabase client hardening', () => {
  it('uses SUPABASE_SERVICE_ROLE_KEY for the server room client when present', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = 'https://writeros.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    const { getRoomDb } = await loadClientModule();

    getRoomDb();

    expect(createClientMock).toHaveBeenCalledWith(
      'https://writeros.supabase.co',
      'service-role-key',
      { auth: { persistSession: false } },
    );
  });

  it('refuses production room DB access when only the anon key is configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = 'https://writeros.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    const { getRoomDb, isRoomConfigured } = await loadClientModule();

    expect(isRoomConfigured()).toBe(false);
    expect(() => getRoomDb()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('keeps anon-key fallback available outside production for local spike databases', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SUPABASE_URL = 'https://writeros.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    const { getRoomDb, isRoomConfigured } = await loadClientModule();

    expect(isRoomConfigured()).toBe(true);
    getRoomDb();

    expect(createClientMock).toHaveBeenCalledWith(
      'https://writeros.supabase.co',
      'anon-key',
      { auth: { persistSession: false } },
    );
  });
});
