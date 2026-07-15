-- Preserve export_pitch_packet's transaction while encoding packet.exportedAt
-- as RFC3339 UTC for the shared PitchPacketSchema.

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
        jsonb_set(
          packet,
          '{exportedAt}',
          to_jsonb(to_char(v_exported_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
          true
        ),
        '{directionRevision}',
        to_jsonb(direction_revision),
        true
      )
  where id = p_packet_id
  returning * into v_packet;

  update interview_sessions
  set state = 'exported', updated_at = v_exported_at
  where id = p_session_id;

  return v_packet;
end;
$$;

revoke execute on function export_pitch_packet(text, uuid, uuid) from public, anon, authenticated;
grant execute on function export_pitch_packet(text, uuid, uuid) to service_role;
