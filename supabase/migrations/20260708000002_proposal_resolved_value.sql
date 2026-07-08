-- First Meeting — Phase 2 Slice 2: writer-confirmed proposal values.
-- Keeps the agent's original transcription in proposed_value; stores the
-- writer-confirmed/edited value here when confirmation differs.

alter table proposals add column resolved_value text;
