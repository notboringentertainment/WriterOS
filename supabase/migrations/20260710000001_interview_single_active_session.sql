-- One active Project Meeting per project (writers-room-runtime-prd §A4).
-- The runtime pre-checks before insert, but this partial unique index is the
-- authoritative guard: two concurrent /interview/start requests raced past the
-- check in testing (11ms apart) and both created sessions. Banked/exported
-- sessions are history and stay unconstrained (new rounds append).

create unique index if not exists interview_sessions_one_active_per_project
  on interview_sessions (project_id)
  where state in ('intake', 'auditing', 'interviewing', 'readback', 'paused');
