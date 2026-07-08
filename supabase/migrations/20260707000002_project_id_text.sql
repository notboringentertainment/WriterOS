-- project_id: uuid → text.
-- WriterOS project ids are client-generated strings, NOT guaranteed UUIDs:
-- crypto.randomUUID() when available, but fallback ids look like
-- `project-<ts>-<rand>`, and test/folder projects use ids like `p1`.
-- The room tables must accept whatever activeProjectId the client carries.
-- (Codex review P1; tables were empty when this ran.)

alter table room_messages    alter column project_id type text using project_id::text;
alter table memory_blocks    alter column project_id type text using project_id::text;
alter table room_events      alter column project_id type text using project_id::text;
alter table proposals        alter column project_id type text using project_id::text;
alter table agent_turn_ledger alter column project_id type text using project_id::text;
