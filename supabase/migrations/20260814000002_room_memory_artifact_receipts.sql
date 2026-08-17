alter table memory_blocks
  add column if not exists memory_receipt jsonb;

alter table proposals
  add column if not exists memory_receipt jsonb;

comment on column memory_blocks.memory_receipt is
  'Exact unified project-memory receipt for the model-authored block value.';

comment on column proposals.memory_receipt is
  'Exact unified project-memory receipt for the model-authored proposal value and rationale.';
