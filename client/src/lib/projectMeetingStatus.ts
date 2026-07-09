// Project Meeting status derivation shared by the Home chips and the room's status line.

import { fetchInterviewStatus, type InterviewStatus } from './roomApi'

export type ProjectMeetingStanding = 'not_started' | 'paused' | 'in_progress' | 'banked'

export function deriveProjectMeetingStanding(status: InterviewStatus): ProjectMeetingStanding {
  const state = status.activeSession?.state
  if (state === 'paused') return 'paused'
  if (state === 'interviewing' || state === 'auditing' || state === 'readback') return 'in_progress'
  if (state === 'banked' || state === 'exported' || status.hasBankedSeed) return 'banked'
  return 'not_started'
}

export function projectMeetingStandingLabel(standing: ProjectMeetingStanding): string {
  switch (standing) {
    case 'paused': return 'paused'
    case 'in_progress': return 'in progress'
    case 'banked': return 'banked'
    default: return 'not started'
  }
}

/** Best-effort batch fetch for Home cards. Failures are omitted — Home must never break on the room API. */
export async function fetchProjectMeetingStandings(projectIds: readonly string[]): Promise<Record<string, ProjectMeetingStanding>> {
  const results = await Promise.allSettled(projectIds.map(async id => [id, deriveProjectMeetingStanding(await fetchInterviewStatus(id))] as const))
  const standings: Record<string, ProjectMeetingStanding> = {}
  for (const result of results) {
    if (result.status === 'fulfilled') standings[result.value[0]] = result.value[1]
  }
  return standings
}
