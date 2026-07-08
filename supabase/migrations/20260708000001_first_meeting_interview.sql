-- First Meeting — Phase 2 Slice 1: interview_sessions table + proposals
-- extension (PRD Addendum A: §A4 session table, §A7.2 proposal discriminators,
-- §A7.2 answers transcript column).
--
-- This migration is additive: it creates one new table, adds four columns to
-- the existing proposals table, and creates the indexes the Phase 2 loops need.
-- It does NOT alter Phase 1 behavior.

-- §A4: interview_sessions
create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,                 -- text (mirrors Phase 1 migration 20260707000002)
  mode text not null,                       -- 'quick' | 'full'
  state text not null default 'intake',     -- intake → auditing → interviewing → readback → banked → exported (+ paused)
  seed_text text not null default '',       -- verbatim writer seed, never edited after intake
  audit jsonb not null default '{}',        -- per-area SUFFICIENT|THIN verdicts (§A5.2)
  cursor jsonb not null default '{}',       -- current lane, question_id, budgets spent
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- §A7.2: answers transcript — answers that never become proposals still
-- carry provenance. Disposition: 'field_mapped' | 'seed_color' | 'skipped_delegated'.
alter table interview_sessions add column answers jsonb not null default '[]';

-- §A7.2: proposals table extension (discriminator + provenance)
alter table proposals add column kind text not null default 'ambient_suggestion';
  -- 'ambient_suggestion' | 'interview_answer'
alter table proposals add column session_id uuid references interview_sessions(id);
alter table proposals add column question_id text;
alter table proposals add column origin text;
  -- 'seed' | 'extrapolated'  (interview never produces 'invented';
  --  ambient_suggestion rows record 'extrapolated' or 'invented')

-- Phase 2 access-path indexes:
--   interview sessions by project_id (list sessions for a project, newest first)
create index interview_sessions_project_idx
  on interview_sessions (project_id, created_at desc);

--   proposals by session_id (query interview proposals for a session)
create index proposals_session_idx
  on proposals (session_id)
  where session_id is not null;
