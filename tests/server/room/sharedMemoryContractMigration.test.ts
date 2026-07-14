import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260712000001_shared_memory_contract_fns.sql'),
  'utf8',
);

describe('shared memory contract migration', () => {
  it('defines ensure_project_memory with the contracted signature', () => {
    expect(migration).toMatch(
      /create or replace function ensure_project_memory\(\s*p_project_id text,\s*p_agent_ids text\[\],\s*p_blocks jsonb\s*\)/,
    );
  });

  it('creates blocks idempotently and repairs blank rows without touching non-blank content', () => {
    expect(migration).toMatch(/on conflict \(project_id, agent_id, label\) do nothing/);
    expect(migration).toMatch(/mb\.value ~ '\^\\s\*\$'/); // regex ^\s*$ — matches JS .trim() blank set exactly
  });

  it('repairs char_cap drift without touching values', () => {
    expect(migration).toMatch(/set char_cap = b\.cap/);
    expect(migration).toMatch(/mb\.char_cap <> b\.cap/);
  });

  it('detects preserved over-cap values and warns without truncating', () => {
    expect(migration).toMatch(/length\(mb\.value\) > b\.cap/);
    expect(migration).toMatch(/raise warning 'memory_over_cap/);
  });

  it('inserts attachments idempotently for roster x blocks', () => {
    expect(migration).toContain('insert into block_attachments');
    expect(migration).toMatch(/on conflict \(block_id, agent_id\) do nothing/);
    expect(migration).toContain('unnest(p_agent_ids)');
  });

  it('defines bank_meeting_memory with session row lock, state guard, and locks CAS', () => {
    expect(migration).toMatch(/create or replace function bank_meeting_memory\(/);
    expect(migration).toContain('for update');
    expect(migration).toContain("return 'already_banked'");
    expect(migration).toMatch(/value = p_locks_expected/); // compare-and-swap predicate
    expect(migration).toContain("raise exception 'locks_conflict'");
    expect(migration).toMatch(/cap_exceeded/);
  });

  it('serializes different-session banks with a monotonic project revision CAS', () => {
    expect(migration).toMatch(/alter table memory_blocks\s+add column if not exists revision bigint not null default 0/);
    expect(migration).toMatch(/p_bank_revision bigint/);
    expect(migration).toMatch(/revision = revision \+ 1/);
    expect(migration).toMatch(/revision = p_bank_revision/);
    expect(migration).toContain("raise exception 'projection_conflict'");
  });

  it('adds and transactionally persists the immutable session bank snapshot', () => {
    expect(migration).toMatch(/alter table interview_sessions\s+add column if not exists bank_snapshot jsonb/);
    expect(migration).toMatch(/p_bank_snapshot jsonb/);
    expect(migration).toMatch(/invalid_bank_snapshot/);
    // Missing JSON keys produce SQL NULL. `IS DISTINCT FROM` is required so
    // absent/wrong-shaped members fail validation instead of slipping through.
    expect(migration).toMatch(/jsonb_typeof\(p_bank_snapshot->'applied_classifications'\) is distinct from 'object'/);
    expect(migration).toMatch(/jsonb_typeof\(p_bank_snapshot->'open_questions'\) is distinct from 'array'/);
    expect(migration).toMatch(/jsonb_typeof\(p_bank_snapshot->'legacy_open_questions'\) is distinct from 'array'/);
    expect(migration).toMatch(/bank_snapshot = p_bank_snapshot/);
  });

  it('both functions are service-role only', () => {
    expect(migration).toMatch(/revoke execute on function ensure_project_memory.* from public, anon, authenticated/i);
    expect(migration).toMatch(/revoke execute on function bank_meeting_memory.* from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function ensure_project_memory.* to service_role/i);
    expect(migration).toMatch(/grant execute on function bank_meeting_memory.* to service_role/i);
  });
});
