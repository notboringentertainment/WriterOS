import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260708000003_room_rls_hardening.sql'),
  'utf8',
);

describe('room RLS hardening migration', () => {
  it.each([
    'room_messages',
    'memory_blocks',
    'block_attachments',
    'room_events',
    'proposals',
    'agent_turn_ledger',
    'interview_sessions',
  ])('enables row level security for %s', (table) => {
    expect(migration).toContain(`alter table ${table} enable row level security;`);
  });

  it('documents server-only service-role access instead of adding permissive anon policies', () => {
    expect(migration).toMatch(/server-only/i);
    expect(migration).not.toMatch(/create policy/i);
  });
});
