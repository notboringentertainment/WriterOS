-- One active Project Meeting per project (writers-room-runtime-prd §A4).
-- The runtime pre-checks before insert, but this partial unique index is the
-- authoritative guard: two concurrent /interview/start requests raced past the
-- check in testing (11ms apart) and both created sessions. Banked/exported
-- sessions are history and stay unconstrained (new rounds append).

-- Deterministic preflight: any duplicate active sessions can only have been
-- produced by the pre-guard race bug. Keep the most recent active session per
-- project (created_at desc, id desc as tiebreak) and remove the older strays,
-- so the index creation below cannot abort on legacy data.
delete from interview_sessions victim
using interview_sessions keeper
where victim.project_id = keeper.project_id
  and victim.id <> keeper.id
  and victim.state in ('intake', 'auditing', 'interviewing', 'readback', 'paused')
  and keeper.state in ('intake', 'auditing', 'interviewing', 'readback', 'paused')
  and (keeper.created_at, keeper.id) > (victim.created_at, victim.id);

create unique index if not exists interview_sessions_one_active_per_project
  on interview_sessions (project_id)
  where state in ('intake', 'auditing', 'interviewing', 'readback', 'paused');
