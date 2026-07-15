import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260714000001_meeting_revisions_pitch_packets.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('Meeting revisions and Pitch Packet migration', () => {
  it('adds the append-only decision ledger and required indexes', () => {
    expect(migration).toMatch(/create table if not exists meeting_decisions\s*\(/i);
    expect(migration).toMatch(/project_id text not null/i);
    expect(migration).toMatch(/session_id uuid not null references interview_sessions\s*\(id\)/i);
    expect(migration).toMatch(/area text not null/i);
    expect(migration).toMatch(/field_path text not null/i);
    expect(migration).toMatch(/op text not null check\s*\(op in \('assert', 'revise', 'retract', 'supersede', 'redirect'\)\)/i);
    expect(migration).toMatch(/content jsonb not null/i);
    expect(migration).toMatch(/targets uuid\[\] not null default '\{\}'/i);
    expect(migration).toMatch(/meeting_decisions_project_idx\s+on meeting_decisions \(project_id/i);
    expect(migration).toMatch(/meeting_decisions_session_idx\s+on meeting_decisions \(session_id/i);
    expect(migration).toMatch(/meeting_decisions_targets_idx\s+on meeting_decisions using gin \(targets\)/i);
    expect(migration).toMatch(/before update or delete on meeting_decisions/i);
  });

  it('adds Pitch Packet persistence with session ownership and immutable exports', () => {
    expect(migration).toMatch(/create table if not exists pitch_packets\s*\(/i);
    expect(migration).toMatch(/session_id uuid not null references interview_sessions\s*\(id\)/i);
    expect(migration).toMatch(/packet jsonb not null/i);
    expect(migration).toMatch(/packet_version int not null/i);
    expect(migration).toMatch(/status text not null check\s*\(status in \('draft', 'approved', 'exported'\)\)/i);
    expect(migration).toMatch(/direction_revision bigint not null/i);
    expect(migration).toMatch(/pitch_packets_project_created_idx\s+on pitch_packets \(project_id, created_at desc\)/i);
    expect(migration).toMatch(/pitch_packets_session_idx\s+on pitch_packets \(session_id\)/i);
    expect(migration).toMatch(/create unique index[\s\S]*on pitch_packets \(session_id\)\s+where status in \('draft', 'approved'\)/i);
    expect(migration).toMatch(/old\.status = 'exported'/i);
  });

  it('wraps the existing bank function and writes decisions in the same transaction', () => {
    expect(migration).toMatch(/create or replace function bank_meeting_round\s*\(/i);
    expect(migration).not.toMatch(/create or replace function bank_meeting_memory\s*\(/i);
    expect(migration).toMatch(/p_direction_revision bigint/i);
    expect(migration).toMatch(/p_decisions jsonb/i);
    expect(migration).toContain('direction_conflict');
    expect(migration).toMatch(/bank_meeting_memory\s*\(/i);
    expect(migration).toContain("if v_bank_result = 'already_banked'");
    expect(migration).toMatch(/insert into meeting_decisions/i);
  });

  it('exports packet and session through one database function', () => {
    expect(migration).toMatch(/create or replace function export_pitch_packet\s*\(/i);
    expect(migration).toMatch(/where id = p_packet_id[\s\S]*for update/i);
    expect(migration).toMatch(/status = 'exported'[\s\S]*exported_at = v_exported_at/i);
    expect(migration).toMatch(/update interview_sessions[\s\S]*set state = 'exported'/i);
    expect(migration).toContain('packet_not_approved');
    expect(migration).toContain('session_not_banked');
  });

  it('provides an explicit idempotent service-role backfill without read hooks', () => {
    expect(migration).toMatch(/create or replace function backfill_meeting_decisions\s*\(/i);
    expect(migration).toMatch(/not exists\s*\([\s\S]*from meeting_decisions/i);
    expect(migration).toMatch(/grant execute on function backfill_meeting_decisions\(text\) to service_role/i);
    expect(migration).toMatch(/revoke execute on function backfill_meeting_decisions\(text\) from public, anon, authenticated/i);
    expect(migration).not.toMatch(/create trigger\s+\w*backfill_meeting_decisions/i);
  });

  it('is additive and leaves the existing document and memory block shapes alone', () => {
    expect(migration).not.toMatch(/drop\s+(table|column)/i);
    expect(migration).not.toMatch(/alter table memory_blocks\s+(add|drop|alter)/i);
    expect(migration).not.toMatch(/document_schema_version/i);
  });
});
