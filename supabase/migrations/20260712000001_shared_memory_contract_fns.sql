-- Addendum B4: atomic, idempotent shared-memory initializer, plus the
-- transactional Meeting bank. Server-only (see 20260708000003): callable by
-- the service-role server, never by anon/authenticated clients. Sentinels,
-- caps, and the roster are passed in so the contract's source of truth stays
-- in TypeScript (server/room/memoryContract.ts).

alter table interview_sessions
  add column if not exists bank_snapshot jsonb;

alter table memory_blocks
  add column if not exists revision bigint not null default 0;

comment on column interview_sessions.bank_snapshot is
  'Immutable bank-time decisions, exact current-round open/delegated questions, and first-bank legacy question adoption.';

create or replace function ensure_project_memory(
  p_project_id text,
  p_agent_ids text[],
  p_blocks jsonb
)
returns void
language plpgsql
as $$
begin
  -- Missing rows get sentinels; existing rows are untouched here.
  insert into memory_blocks (project_id, agent_id, label, value, char_cap, updated_by)
  select p_project_id, null, b->>'label', b->>'sentinel', (b->>'cap')::int, 'system'
  from jsonb_array_elements(p_blocks) as b
  on conflict (project_id, agent_id, label) do nothing;

  -- Blank/whitespace-only rows are broken writes, not writer content:
  -- normalize them to the sentinel. Use the regex `^\s*$` so SQL classifies the
  -- SAME strings blank as JS `.trim()` — a btrim character set diverges (`\f`,
  -- `\v`, NBSP, etc.) and any mismatch drives a fail-closed repair loop where
  -- one layer keeps repairing what the other reads as content. Non-blank
  -- content is never modified.
  update memory_blocks mb
  set value = b.sentinel, updated_by = 'system', updated_at = now()
  from (select x->>'label' as label, x->>'sentinel' as sentinel from jsonb_array_elements(p_blocks) as x) b
  where mb.project_id = p_project_id
    and mb.agent_id is null
    and mb.label = b.label
    and mb.value ~ '^\s*$';

  -- Cap drift: a row carrying the wrong char_cap is not a healthy contract
  -- state. Repair the cap; never touch the value here.
  update memory_blocks mb
  set char_cap = b.cap, updated_at = now()
  from (select x->>'label' as label, (x->>'cap')::int as cap from jsonb_array_elements(p_blocks) as x) b
  where mb.project_id = p_project_id
    and mb.agent_id is null
    and mb.label = b.label
    and mb.char_cap <> b.cap;

  -- Over-cap detection: a preserved (non-blank) value longer than its contract
  -- cap is a broken contract state, but the value is REAL writer content — never
  -- truncate it here. Surface it loudly so the caller (readContractComplete,
  -- Task 4 — see E5) can fail closed. `raise warning` emits a diagnostic row per
  -- offending block without aborting the initialization transaction.
  declare
    v_over record;
  begin
    for v_over in
      select mb.label, length(mb.value) as len, b.cap
      from memory_blocks mb
      join (select x->>'label' as label, (x->>'cap')::int as cap from jsonb_array_elements(p_blocks) as x) b
        on b.label = mb.label
      where mb.project_id = p_project_id
        and mb.agent_id is null
        and mb.value !~ '^\s*$'
        and length(mb.value) > b.cap
    loop
      raise warning 'memory_over_cap:% length=% cap=%', v_over.label, v_over.len, v_over.cap;
    end loop;
  end;

  insert into block_attachments (block_id, agent_id)
  select mb.id, a.agent_id
  from memory_blocks mb
  cross join unnest(p_agent_ids) as a(agent_id)
  where mb.project_id = p_project_id
    and mb.agent_id is null
    and mb.label in (select b->>'label' from jsonb_array_elements(p_blocks) as b)
  on conflict (block_id, agent_id) do nothing;
end;
$$;

-- One transaction for everything a bank owns: story_locks (CAS against the
-- value the server read, so a concurrent surface sync cannot be clobbered),
-- concept_seed projection, open_questions, and the session state transition.
-- Retry-safe: a repeated call after success sees state 'banked'/'exported'
-- and no-ops; any raise rolls the whole bank back (session stays 'readback').
create or replace function bank_meeting_memory(
  p_project_id text,
  p_session_id uuid,
  p_bank_revision bigint,
  p_concept_seed text,
  p_locks_expected text,
  p_locks_next text,
  p_open_questions text,
  p_bank_snapshot jsonb
)
returns text
language plpgsql
as $$
declare
  v_state text;
begin
  select state into v_state
  from interview_sessions
  where id = p_session_id and project_id = p_project_id
  for update;

  if v_state is null then
    raise exception 'session_not_found';
  end if;
  if v_state in ('banked', 'exported') then
    return 'already_banked';
  end if;
  if v_state <> 'readback' then
    raise exception 'invalid_state:%', v_state;
  end if;

  if p_bank_snapshot is null
     or jsonb_typeof(p_bank_snapshot) is distinct from 'object'
     or jsonb_typeof(p_bank_snapshot->'applied_classifications') is distinct from 'object'
     or jsonb_typeof(p_bank_snapshot->'open_questions') is distinct from 'array'
     or jsonb_typeof(p_bank_snapshot->'legacy_open_questions') is distinct from 'array' then
    raise exception 'invalid_bank_snapshot';
  end if;

  if length(p_locks_next) > 2000 then raise exception 'cap_exceeded:story_locks'; end if;
  if length(p_concept_seed) > 4000 then raise exception 'cap_exceeded:concept_seed'; end if;
  if length(p_open_questions) > 2000 then raise exception 'cap_exceeded:open_questions'; end if;

  -- Project-wide bank CAS. Session-row locking alone is insufficient: two
  -- DIFFERENT readback sessions can otherwise both project the same old
  -- terminal history and the second silently overwrites the first. Every bank
  -- increments concept_seed.revision even when the rendered value is equal.
  update memory_blocks
  set revision = revision + 1
  where project_id = p_project_id and agent_id is null and label = 'concept_seed'
    and revision = p_bank_revision;
  if not found then
    raise exception 'projection_conflict';
  end if;

  update memory_blocks
  set value = p_locks_next, updated_by = 'writer', updated_at = now()
  where project_id = p_project_id and agent_id is null and label = 'story_locks'
    and value = p_locks_expected;
  if not found then
    raise exception 'locks_conflict';
  end if;

  update memory_blocks
  set value = p_concept_seed, updated_by = 'writer', updated_at = now()
  where project_id = p_project_id and agent_id is null and label = 'concept_seed';
  if not found then
    raise exception 'memory_not_initialized';
  end if;

  update memory_blocks
  set value = p_open_questions, updated_by = 'writer', updated_at = now()
  where project_id = p_project_id and agent_id is null and label = 'open_questions';
  if not found then
    raise exception 'memory_not_initialized';
  end if;

  -- Persist bank-time decisions into the canonical Meeting record IN THE SAME
  -- TRANSACTION as block writes and state transition. `bank_snapshot` contains
  -- applied_classifications, exact current-round open_questions, and any
  -- pre-contract units adopted before the bounded projection could omit them.
  -- It is immutable because this function accepts only readback sessions.
  update interview_sessions
  set state = 'banked',
      bank_snapshot = p_bank_snapshot,
      updated_at = now()
  where id = p_session_id;

  return 'banked';
end;
$$;

revoke execute on function ensure_project_memory(text, text[], jsonb) from public, anon, authenticated;
grant execute on function ensure_project_memory(text, text[], jsonb) to service_role;
revoke execute on function bank_meeting_memory(text, uuid, bigint, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function bank_meeting_memory(text, uuid, bigint, text, text, text, text, jsonb) to service_role;
