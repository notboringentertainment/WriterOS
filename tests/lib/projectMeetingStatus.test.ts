import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { fetchInterviewStatus: vi.fn() },
}))
vi.mock('../../client/src/lib/roomApi', () => apiMock)

import { deriveProjectMeetingStanding, fetchProjectMeetingStandings } from '../../client/src/lib/projectMeetingStatus'
import type { InterviewStatus } from '../../client/src/lib/roomApi'

function status(state: string | null, hasBankedSeed = false): InterviewStatus {
  return {
    activeSession: state ? ({ state } as InterviewStatus['activeSession']) : null,
    hasBankedSeed,
    actionLabel: 'Project Meeting',
    currentQuestion: null,
  } as InterviewStatus
}

beforeEach(() => {
  apiMock.fetchInterviewStatus.mockReset()
})

describe('deriveProjectMeetingStanding', () => {
  it('maps session states to standings', () => {
    expect(deriveProjectMeetingStanding(status(null))).toBe('not_started')
    expect(deriveProjectMeetingStanding(status('paused'))).toBe('paused')
    expect(deriveProjectMeetingStanding(status('auditing'))).toBe('in_progress')
    expect(deriveProjectMeetingStanding(status('interviewing'))).toBe('in_progress')
    expect(deriveProjectMeetingStanding(status('readback'))).toBe('in_progress')
    expect(deriveProjectMeetingStanding(status('banked'))).toBe('banked')
    expect(deriveProjectMeetingStanding(status('exported'))).toBe('banked')
    expect(deriveProjectMeetingStanding(status(null, true))).toBe('banked')
  })
})

describe('fetchProjectMeetingStandings', () => {
  it('batches per project and silently omits failures', async () => {
    apiMock.fetchInterviewStatus.mockImplementation(async (projectId: string) => {
      if (projectId === 'p-down') throw new Error('room api 500')
      return status(projectId === 'p-paused' ? 'paused' : null)
    })

    const standings = await fetchProjectMeetingStandings(['p-paused', 'p-down', 'p-new'])

    expect(standings).toEqual({ 'p-paused': 'paused', 'p-new': 'not_started' })
  })
})
