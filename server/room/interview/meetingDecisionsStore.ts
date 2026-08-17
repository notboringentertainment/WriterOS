import { getRoomDb } from '../supabaseClient';
import {
  foldMeetingDecisions,
  type ActiveMeetingDirection,
} from './meetingDecisions';
import type { MeetingDecisionRow } from './types';

export async function listMeetingDecisions(projectId: string): Promise<MeetingDecisionRow[]> {
  const result = await getRoomDb()
    .from('meeting_decisions')
    .select()
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (result.error) {
    throw new Error(`[meetingDecisions.store] listMeetingDecisions: ${result.error.message}`);
  }
  return (result.data ?? []) as MeetingDecisionRow[];
}

export async function getActiveMeetingDirection(projectId: string): Promise<ActiveMeetingDirection> {
  return foldMeetingDecisions(await listMeetingDecisions(projectId));
}
