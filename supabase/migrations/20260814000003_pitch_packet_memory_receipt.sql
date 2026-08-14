alter table pitch_packets
  add column if not exists memory_receipt jsonb;

comment on column pitch_packets.memory_receipt is
  'Exact unified project-memory receipt used to generate this Pitch Packet draft.';
