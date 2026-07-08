-- Writers' Room Runtime — Phase 1 tables (PRD §5, verbatim schema).
-- One room, seven residents, one writer. Persona identity stays in
-- shared/personas.ts; the roster is code, the state is rows.
--
-- RLS is intentionally disabled for the Phase 1 spike: the only client is the
-- local WriterOS dev server holding the project key. Harden before any deploy
-- (see DECISIONS.md).

create table room_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  author text not null,            -- 'writer' | persona id
  kind text not null default 'say',-- 'say' | 'proposal_ref' | 'system'
  content text not null,
  reply_to uuid references room_messages(id),
  created_at timestamptz default now()
);

create table memory_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,                 -- null = writer-global (voice_profile, rapport)
  agent_id text,                   -- null = shared block
  label text not null,
  value text not null default '',
  char_cap int not null default 2000,
  updated_by text,                 -- 'writer' | persona id | 'digest'
  updated_at timestamptz default now(),
  -- nulls not distinct: shared blocks have agent_id null (and writer-global
  -- blocks have project_id null); without it, upsert-on-conflict never fires
  -- and duplicates accumulate.
  unique nulls not distinct (project_id, agent_id, label)
);

create table block_attachments (   -- which agents see which shared blocks
  block_id uuid references memory_blocks(id) on delete cascade,
  agent_id text not null,
  primary key (block_id, agent_id)
);

create table room_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}',
  processed_at timestamptz,        -- null = queued
  created_at timestamptz default now()
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  agent_id text not null,
  surface text not null,           -- 'storyBible' | 'outline' | 'synopsis' | 'treatment'
  field_path text not null,        -- e.g. 'characters[ace].want'
  proposed_value text not null,
  rationale text not null,
  status text not null default 'pending', -- 'pending'|'adopted'|'rejected'|'superseded'|'blocked'
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table agent_turn_ledger (   -- budget + observability
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  agent_id text not null,
  trigger_event uuid references room_events(id),
  action text not null,            -- 'spoke'|'proposed'|'passed'|'digested'|'errored'
  input_tokens int, output_tokens int,
  created_at timestamptz default now()
);

-- Access-path indexes for the Phase 1 loops: channel reads, queue claims,
-- pending-proposal lookups, block context assembly.
create index room_messages_project_created_idx on room_messages (project_id, created_at desc);
create index room_events_queued_idx on room_events (project_id, created_at) where processed_at is null;
create index proposals_project_status_idx on proposals (project_id, status);
create index memory_blocks_project_idx on memory_blocks (project_id, agent_id, label);
