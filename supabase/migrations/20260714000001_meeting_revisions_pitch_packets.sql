-- Project Meeting revisions + reviewed Pitch Packet persistence.
-- Additive only. Existing bank_meeting_memory signature remains callable.

create table if not exists meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  session_id uuid not null references interview_sessions(id) on delete restrict,
  area text not null,
  field_path text not null,
  op text not null check (op in ('assert', 'revise', 'retract', 'supersede', 'redirect')),
  content jsonb not null default '{}'::jsonb,
  targets uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists meeting_decisions_project_idx
  on meeting_decisions (project_id, created_at, id);
create index if not exists meeting_decisions_session_idx
  on meeting_decisions (session_id, created_at, id);
create index if not exists meeting_decisions_targets_idx
  on meeting_decisions using gin (targets);

create table if not exists pitch_packets (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  session_id uuid not null references interview_sessions(id) on delete restrict,
  packet jsonb not null,
  packet_version int not null check (packet_version > 0),
  status text not null check (status in ('draft', 'approved', 'exported')),
  direction_revision bigint not null check (direction_revision >= 0),
  created_at timestamptz not null default now(),
  exported_at timestamptz
);

create index if not exists pitch_packets_project_created_idx
  on pitch_packets (project_id, created_at desc);
create index if not exists pitch_packets_session_idx
  on pitch_packets (session_id);
create unique index if not exists pitch_packets_one_unexported_per_session_idx
  on pitch_packets (session_id)
  where status in ('draft', 'approved');

create or replace function reject_meeting_decision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'meeting_decisions_append_only';
end;
$$;

drop trigger if exists meeting_decisions_append_only on meeting_decisions;
create trigger meeting_decisions_append_only
before update or delete on meeting_decisions
for each row execute function reject_meeting_decision_mutation();

create or replace function guard_pitch_packet_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'exported' then
    raise exception 'exported_pitch_packet_immutable';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.session_id is distinct from old.session_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'pitch_packet_identity_immutable';
  end if;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

drop trigger if exists pitch_packets_immutable_exports on pitch_packets;
create trigger pitch_packets_immutable_exports
before update or delete on pitch_packets
for each row execute function guard_pitch_packet_mutation();

alter table meeting_decisions enable row level security;
alter table pitch_packets enable row level security;

revoke all on meeting_decisions from public, anon, authenticated;
revoke all on pitch_packets from public, anon, authenticated;
grant select, insert on meeting_decisions to service_role;
grant select, insert, update, delete on pitch_packets to service_role;

-- Locks the session first, matching bank_meeting_memory's lock order. A stale
-- entry token raises direction_conflict. A writer racing between this read and
-- bank_meeting_memory's revision CAS still raises projection_conflict there.
create or replace function bank_meeting_round(
  p_project_id text,
  p_session_id uuid,
  p_bank_revision bigint,
  p_direction_revision bigint,
  p_concept_seed text,
  p_locks_expected text,
  p_locks_next text,
  p_open_questions text,
  p_bank_snapshot jsonb,
  p_decisions jsonb
)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_current_direction_revision bigint;
  v_bank_result text;
begin
  select state into v_state
  from interview_sessions
  where id = p_session_id and project_id = p_project_id
  for update;

  if v_state is null then raise exception 'session_not_found'; end if;
  if v_state in ('banked', 'exported') then return 'already_banked'; end if;
  if v_state <> 'readback' then raise exception 'invalid_state:%', v_state; end if;

  select revision into v_current_direction_revision
  from memory_blocks
  where project_id = p_project_id and agent_id is null and label = 'concept_seed';

  if v_current_direction_revision is null then raise exception 'memory_not_initialized'; end if;
  if v_current_direction_revision is distinct from p_direction_revision then
    raise exception 'direction_conflict';
  end if;

  if p_decisions is null or jsonb_typeof(p_decisions) is distinct from 'array' then
    raise exception 'invalid_meeting_decisions';
  end if;

  v_bank_result := bank_meeting_memory(
    p_project_id,
    p_session_id,
    p_bank_revision,
    p_concept_seed,
    p_locks_expected,
    p_locks_next,
    p_open_questions,
    p_bank_snapshot
  );

  if v_bank_result = 'already_banked' then return v_bank_result; end if;

  insert into meeting_decisions (
    id,
    project_id,
    session_id,
    area,
    field_path,
    op,
    content,
    targets,
    created_at
  )
  select
    coalesce((item->>'id')::uuid, gen_random_uuid()),
    p_project_id,
    p_session_id,
    item->>'area',
    item->>'field_path',
    item->>'op',
    coalesce(item->'content', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(item->'targets'))::uuid[], '{}'),
    coalesce((item->>'created_at')::timestamptz, now())
  from jsonb_array_elements(p_decisions) as item;

  return v_bank_result;
end;
$$;

create or replace function export_pitch_packet(
  p_project_id text,
  p_session_id uuid,
  p_packet_id uuid
)
returns pitch_packets
language plpgsql
as $$
declare
  v_packet pitch_packets%rowtype;
  v_session_state text;
  v_exported_at timestamptz := now();
begin
  select * into v_packet
  from pitch_packets
  where id = p_packet_id
    and project_id = p_project_id
    and session_id = p_session_id
  for update;

  if v_packet.id is null then raise exception 'pitch_packet_not_found'; end if;
  if v_packet.status <> 'approved' then raise exception 'packet_not_approved'; end if;

  select state into v_session_state
  from interview_sessions
  where id = p_session_id and project_id = p_project_id
  for update;

  if v_session_state is null then raise exception 'session_not_found'; end if;
  if v_session_state <> 'banked' then raise exception 'session_not_banked'; end if;

  update pitch_packets
  set status = 'exported',
      exported_at = v_exported_at,
      packet = jsonb_set(
        jsonb_set(packet, '{exportedAt}', to_jsonb(v_exported_at::text), true),
        '{directionRevision}', to_jsonb(direction_revision), true
      )
  where id = p_packet_id
  returning * into v_packet;

  update interview_sessions
  set state = 'exported', updated_at = v_exported_at
  where id = p_session_id;

  return v_packet;
end;
$$;

-- Explicit operator hygiene only. No trigger, read helper, or startup path calls
-- this function. Rows are derived from immutable bank snapshots + adopted
-- interview proposals and keyed by sourceProposalId for rerun idempotence.
create or replace function backfill_meeting_decisions(p_project_id text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted bigint;
begin
  with candidates as (
    select
      s.project_id,
      s.id as session_id,
      p.id as proposal_id,
      case p.question_id
        when 'morgan-locks' then 'locks'
        when 'morgan-ending' then 'ending'
        when 'casey-open' then 'open_questions'
        when 'morgan-backstory' then 'load_bearing_character'
        when 'zoe-world' then 'world_rules'
        else 'question:' || coalesce(p.question_id, p.id::text)
      end as area,
      p.field_path,
      coalesce(p.resolved_value, p.proposed_value) as statement,
      classification.value as mutability,
      case p.origin
        when 'extrapolated' then '[EXTRAPOLATED]'
        when 'invented' then '[INVENTED]'
        else '[SEED]'
      end as origin_marker,
      coalesce(s.updated_at, s.created_at, now()) as created_at
    from interview_sessions s
    cross join lateral jsonb_each_text(s.bank_snapshot->'applied_classifications') classification
    join proposals p
      on p.id::text = classification.key
     and p.session_id = s.id
     and p.status = 'adopted'
    where s.state in ('banked', 'exported')
      and s.bank_snapshot is not null
      and (p_project_id is null or s.project_id = p_project_id)
  )
  insert into meeting_decisions (
    project_id,
    session_id,
    area,
    field_path,
    op,
    content,
    targets,
    created_at
  )
  select
    c.project_id,
    c.session_id,
    c.area,
    c.field_path,
    'assert',
    jsonb_build_object(
      'statement', c.statement,
      'mutability', c.mutability,
      'originMarker', c.origin_marker,
      'disposition', 'field_mapped',
      'sourceProposalId', c.proposal_id::text
    ),
    '{}',
    c.created_at
  from candidates c
  where not exists (
    select 1
    from meeting_decisions existing
    where existing.session_id = c.session_id
      and existing.op = 'assert'
      and existing.content->>'sourceProposalId' = c.proposal_id::text
  );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function bank_meeting_round(text, uuid, bigint, bigint, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function bank_meeting_round(text, uuid, bigint, bigint, text, text, text, text, jsonb, jsonb) to service_role;
revoke execute on function export_pitch_packet(text, uuid, uuid) from public, anon, authenticated;
grant execute on function export_pitch_packet(text, uuid, uuid) to service_role;
revoke execute on function backfill_meeting_decisions(text) from public, anon, authenticated;
grant execute on function backfill_meeting_decisions(text) to service_role;
