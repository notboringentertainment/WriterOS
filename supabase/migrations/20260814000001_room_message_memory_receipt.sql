alter table room_messages
  add column if not exists memory_receipt jsonb;

comment on column room_messages.memory_receipt is
  'Exact unified project-memory revision, validated citations, and open conflicts supplied to an agent turn.';
