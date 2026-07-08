-- Writers' Room deploy hardening.
--
-- Room persistence is server-only. The server uses SUPABASE_SERVICE_ROLE_KEY,
-- never a client-bundled key, so no permissive anon/authenticated policies are
-- created here. With RLS enabled and no policies, direct client access is
-- denied while the service-role server path continues to work.

alter table room_messages enable row level security;
alter table memory_blocks enable row level security;
alter table block_attachments enable row level security;
alter table room_events enable row level security;
alter table proposals enable row level security;
alter table agent_turn_ledger enable row level security;
alter table interview_sessions enable row level security;
