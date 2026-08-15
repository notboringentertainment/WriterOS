import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemorySurface } from '../../client/src/components/memory/MemorySurface'
import { useProjectMemory } from '../../client/src/lib/useProjectMemory'
import { countRelevantMemoryConflicts } from '../../client/src/lib/wpRouting'
import type { ProjectMemoryConflict, ProjectMemoryRecord, ProjectMemorySnapshot } from '@shared/projectMemory'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// Mirrors how App.tsx actually wires this up: ONE `useProjectMemory` instance
// owned above MemorySurface, passed down as a prop — never a second,
// independent instance created inside MemorySurface itself. This is the
// regression the fix (Finding 1) targets: with two independent instances, an
// action taken in the surface would never be visible to anything else
// reading the "other" hook's state (e.g. an App-level conflict banner).
function Harness({ projectId, fetchImpl, onExit }: { projectId?: string; fetchImpl: FetchImpl; onExit: () => void }) {
  const memory = useProjectMemory(projectId, undefined, fetchImpl)
  return <MemorySurface memory={memory} onExit={onExit} />
}

// Renders a stand-in "banner" (the same read App.tsx's MemoryConflictBanner
// does: countRelevantMemoryConflicts over the shared snapshot) next to
// MemorySurface, both fed by the SAME hook instance, to prove an action taken
// in the surface is visible there immediately — no separate refresh needed.
function HarnessWithBanner({
  projectId,
  fetchImpl,
  onExit,
}: {
  projectId?: string
  fetchImpl: FetchImpl
  onExit: () => void
}) {
  const memory = useProjectMemory(projectId, undefined, fetchImpl)
  const conflictCount = countRelevantMemoryConflicts(memory.snapshot, 'outline')
  return (
    <div>
      <div data-testid="banner-count">{conflictCount}</div>
      <MemorySurface memory={memory} onExit={onExit} />
    </div>
  )
}

function makeRecord(overrides: Partial<ProjectMemoryRecord> & Pick<ProjectMemoryRecord, 'id' | 'claim'>): ProjectMemoryRecord {
  return {
    projectId: 'story-project-1',
    kind: 'development',
    status: 'active',
    detail: undefined,
    tags: [],
    entities: [],
    source: {
      workflow: 'writeros',
      sourceId: 'documents/outline.json::development::topic',
      sourceUri: 'documents/outline.json::development::topic',
      sourceHash: 'hash-1',
      capturedAt: '2026-08-01T12:00:00.000Z',
      approval: 'none',
    },
    evidence: [{ excerpt: 'A generic evidence excerpt for testing.' }],
    safety: 'clear',
    spoiler: false,
    supersedes: [],
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

interface FetchStubOptions {
  snapshot: ProjectMemorySnapshot
  queue?: unknown[]
  onAction?: (action: any) => { status: number; body: unknown } | undefined
}

function createMemoryFetchStub(options: FetchStubOptions) {
  let currentSnapshot = options.snapshot
  const calls: Array<{ url: string; method: string; body?: unknown }> = []

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ url, method, body })

    if (url === '/api/project-library/bootstrap') {
      return jsonResponse(200, { enabled: true, sessionToken: 'test-session-token' })
    }
    if (method === 'GET' && url.endsWith('/snapshot')) {
      return jsonResponse(200, { snapshot: currentSnapshot })
    }
    if (method === 'GET' && url.endsWith('/analysis-queue')) {
      return jsonResponse(200, { items: options.queue ?? [] })
    }
    if (method === 'POST' && url.endsWith('/actions')) {
      const outcome = options.onAction?.(body)
      if (outcome) return jsonResponse(outcome.status, outcome.body)
      return jsonResponse(200, { snapshot: currentSnapshot })
    }
    if (method === 'POST' && /\/analysis-queue\/.+\/retry$/.test(url)) {
      return jsonResponse(200, { item: null })
    }
    return jsonResponse(404, { error: 'not-found', message: 'unhandled test route' })
  })

  return {
    fetchImpl,
    calls,
    setSnapshot(next: ProjectMemorySnapshot) {
      currentSnapshot = next
    },
    getSnapshot() {
      return currentSnapshot
    },
  }
}

const activeCanon = makeRecord({
  id: 'rec-canon-active',
  claim: 'A lighthouse keeper never leaves the island.',
  kind: 'canon',
  status: 'active',
  source: {
    workflow: 'writeros',
    sourceId: 'documents/outline.json::canon::keeper-rule',
    sourceUri: 'documents/outline.json::canon::keeper-rule',
    sourceHash: 'hash-canon',
    capturedAt: '2026-08-01T12:00:00.000Z',
    approval: 'explicit',
  },
})

const canonCandidate = makeRecord({
  id: 'rec-canon-candidate',
  claim: 'A lighthouse keeper leaves twice a year for supplies.',
  kind: 'canon',
  status: 'candidate',
  source: {
    workflow: 'writeros',
    sourceId: 'documents/outline.json::canon::keeper-rule-2',
    sourceUri: 'documents/outline.json::canon::keeper-rule-2',
    sourceHash: 'hash-canon-2',
    capturedAt: '2026-08-02T12:00:00.000Z',
    approval: 'explicit',
  },
})

const developmentCandidate = makeRecord({
  id: 'rec-development-candidate',
  claim: 'A supply boat could be a recurring device.',
  kind: 'development',
  status: 'candidate',
})

const flaggedCandidate = makeRecord({
  id: 'rec-flagged-candidate',
  claim: 'A claim the analyzer flagged for review.',
  kind: 'development',
  status: 'candidate',
  safety: 'flagged',
})

const spoilerCanon = makeRecord({
  id: 'rec-spoiler-canon',
  claim: 'The keeper is the one who set the fire.',
  kind: 'canon',
  status: 'active',
  spoiler: true,
})

const openQuestion = makeRecord({
  id: 'rec-open-question',
  claim: 'Does the keeper ever tell anyone the truth?',
  kind: 'open_question',
  status: 'active',
})

const openConflict: ProjectMemoryConflict = {
  id: 'conflict-1',
  leftRecordId: activeCanon.id,
  rightRecordId: canonCandidate.id,
  reason: 'These two claims disagree about how often the keeper leaves.',
  status: 'open',
}

// A conflict where the left side is flagged, to exercise the store's
// safety === 'clear' activation requirement on the conflict-resolution UI.
const flaggedConflictLeft = makeRecord({
  id: 'rec-flagged-conflict-left',
  claim: 'A flagged claim about the boat schedule.',
  kind: 'development',
  status: 'candidate',
  safety: 'flagged',
})

const flaggedConflictRight = makeRecord({
  id: 'rec-flagged-conflict-right',
  claim: 'A clear claim about the boat schedule.',
  kind: 'development',
  status: 'candidate',
})

const flaggedConflict: ProjectMemoryConflict = {
  id: 'conflict-flagged',
  leftRecordId: flaggedConflictLeft.id,
  rightRecordId: flaggedConflictRight.id,
  reason: 'These two claims disagree about the boat schedule.',
  status: 'open',
}

function baseSnapshot(overrides: Partial<ProjectMemorySnapshot> = {}): ProjectMemorySnapshot {
  return {
    schemaVersion: 1,
    projectId: 'story-project-1',
    revision: 5,
    records: [activeCanon, canonCandidate, developmentCandidate, flaggedCandidate, spoilerCanon, openQuestion],
    conflicts: [openConflict],
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MemorySurface', () => {
  it('shows the exact browser-only message and never fetches when there is no folder project id', async () => {
    const fetchImpl = vi.fn()
    render(<Harness onExit={vi.fn()} fetchImpl={fetchImpl} />)

    expect(await screen.findByText('Shared project memory requires project folder storage.')).toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Memory views' })).not.toBeInTheDocument()
  })

  it('loads the snapshot and shows all five views, defaulting to Canon with active canon only', async () => {
    const stub = createMemoryFetchStub({ snapshot: baseSnapshot() })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Canon', 'Review', 'Developed', 'Open Questions', 'Sources and History'])

    expect(await screen.findByText(activeCanon.claim)).toBeInTheDocument()
    expect(screen.queryByText(canonCandidate.claim)).not.toBeInTheDocument()
  })

  it('shows claim, status, workflow, source locator, evidence, timestamp, and supersession chain in Sources and History', async () => {
    const superseded = makeRecord({
      id: 'rec-superseded',
      claim: 'An earlier, now-replaced claim.',
      kind: 'canon',
      status: 'superseded',
    })
    const supersedingRecord = { ...activeCanon, supersedes: [superseded.id] }
    const stub = createMemoryFetchStub({
      snapshot: baseSnapshot({ records: [supersedingRecord, superseded, canonCandidate, developmentCandidate, flaggedCandidate, spoilerCanon, openQuestion] }),
    })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Sources and History' }))

    const row = (await screen.findByText(supersedingRecord.claim)).closest('article') as HTMLElement
    expect(within(row).getByText(supersedingRecord.kind)).toBeInTheDocument()
    expect(within(row).getByText(supersedingRecord.status)).toBeInTheDocument()
    expect(within(row).getByText(supersedingRecord.source.workflow)).toBeInTheDocument()
    expect(within(row).getByText(`Source: ${supersedingRecord.source.sourceUri}`)).toBeInTheDocument()
    expect(within(row).getByText(`“${supersedingRecord.evidence[0].excerpt}”`)).toBeInTheDocument()
    expect(within(row).getByText(/Updated/)).toBeInTheDocument()
    expect(within(row).getByText(`Supersedes: "${superseded.claim}"`)).toBeInTheDocument()

    const supersededRow = (await screen.findByText(superseded.claim)).closest('article') as HTMLElement
    expect(within(supersededRow).getByText(`Superseded by: "${supersedingRecord.claim}"`)).toBeInTheDocument()
  })

  it('marks flagged records visibly and never offers promoting them, while still offering reject', async () => {
    const stub = createMemoryFetchStub({ snapshot: baseSnapshot() })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    const row = (await screen.findByText(flaggedCandidate.claim)).closest('article') as HTMLElement
    expect(within(row).getByText('Flagged')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Promote' })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('keeps spoiler records visible with a Spoiler badge rather than hiding them', async () => {
    const stub = createMemoryFetchStub({ snapshot: baseSnapshot() })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    const row = (await screen.findByText(spoilerCanon.claim)).closest('article') as HTMLElement
    expect(within(row).getByText('Spoiler')).toBeInTheDocument()
  })

  it('promotes a plain (non-canon) candidate without requiring confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const stub = createMemoryFetchStub({
      snapshot: baseSnapshot(),
      onAction: action => {
        expect(action).toEqual({
          type: 'promote',
          recordId: developmentCandidate.id,
          expectedRevision: 5,
          supersedes: [],
        })
        const next = baseSnapshot({
          revision: 6,
          records: [activeCanon, canonCandidate, { ...developmentCandidate, status: 'active' }, flaggedCandidate, spoilerCanon, openQuestion],
        })
        stub.setSnapshot(next)
        return { status: 200, body: { snapshot: next } }
      },
    })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    const row = (await screen.findByText(developmentCandidate.claim)).closest('article') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Promote' }))

    await waitFor(() => expect(confirmSpy).not.toHaveBeenCalled())
    await waitFor(() => expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(true))
  })

  it('requires confirmation before replacing active canon, and does nothing when the writer cancels', async () => {
    const onAction = vi.fn(() => undefined)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const stub = createMemoryFetchStub({ snapshot: baseSnapshot(), onAction })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    const replaceSelect = await screen.findByLabelText(`Canon to replace with "${canonCandidate.claim}"`)
    const row = replaceSelect.closest('article') as HTMLElement
    fireEvent.change(replaceSelect, { target: { value: activeCanon.id } })
    fireEvent.click(within(row).getByRole('button', { name: 'Replace selected canon' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(false)

    confirmSpy.mockReturnValue(true)
    fireEvent.click(within(row).getByRole('button', { name: 'Replace selected canon' }))
    await waitFor(() => expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(true))
    const actionCall = stub.calls.find(call => call.url.endsWith('/actions'))
    expect(actionCall?.body).toEqual({
      type: 'promote',
      recordId: canonCandidate.id,
      expectedRevision: 5,
      supersedes: [activeCanon.id],
    })
  })

  it('resolves an open conflict from the Review view using the false-positive control', async () => {
    const stub = createMemoryFetchStub({
      snapshot: baseSnapshot(),
      onAction: action => {
        expect(action).toEqual({
          type: 'resolve-conflict',
          conflictId: openConflict.id,
          expectedRevision: 5,
          resolution: 'not-conflict',
        })
        return { status: 200, body: { snapshot: baseSnapshot({ revision: 6, conflicts: [{ ...openConflict, status: 'resolved', resolution: 'not-conflict' }] }) } }
      },
    })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    expect(await screen.findByText(openConflict.reason)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'False positive' }))

    await waitFor(() => expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(true))
  })

  it('requires confirmation before a conflict resolution supersedes active canon, and skips it when nothing active is superseded', async () => {
    const onAction = vi.fn(() => undefined)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const stub = createMemoryFetchStub({ snapshot: baseSnapshot(), onAction })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    await screen.findByText(openConflict.reason)

    // Keep left: the loser (right = canonCandidate) is only a candidate, not
    // active — nothing gets superseded, so no confirmation should appear.
    fireEvent.click(screen.getByRole('button', { name: 'Keep left' }))
    await waitFor(() => expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(true))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(stub.calls.find(call => call.url.endsWith('/actions'))?.body).toEqual({
      type: 'resolve-conflict',
      conflictId: openConflict.id,
      expectedRevision: 5,
      resolution: 'left',
    })

    stub.calls.length = 0
    onAction.mockClear()

    // Keep right: the loser (left = activeCanon) IS active — this would
    // supersede it, so it must be confirmed first.
    fireEvent.click(screen.getByRole('button', { name: 'Keep right' }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(false)

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Keep right' }))
    await waitFor(() => expect(stub.calls.some(call => call.url.endsWith('/actions'))).toBe(true))
    expect(stub.calls.find(call => call.url.endsWith('/actions'))?.body).toEqual({
      type: 'resolve-conflict',
      conflictId: openConflict.id,
      expectedRevision: 5,
      resolution: 'right',
    })
  })

  it('marks a flagged side of a conflict and disables the actions the store would reject', async () => {
    const stub = createMemoryFetchStub({
      snapshot: baseSnapshot({ records: [...baseSnapshot().records, flaggedConflictLeft, flaggedConflictRight], conflicts: [openConflict, flaggedConflict] }),
    })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    const card = (await screen.findByText(flaggedConflict.reason)).closest('article') as HTMLElement

    expect(within(card).getByText('Flagged')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Keep left' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Both valid' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Keep right' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'False positive' })).toBeEnabled()
    expect(within(card).getByText(/Left is flagged/)).toBeInTheDocument()
  })

  it('shows failed WriterOS analysis with a per-item retry action, and clears it once retried', async () => {
    let queue: unknown[] = [{
      id: 'analysis-1',
      surface: 'outline',
      sourceUri: 'documents/outline.json',
      status: 'failed',
      error: 'model unavailable',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:05:00.000Z',
    }]
    const retryCalls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === '/api/project-library/bootstrap') return jsonResponse(200, { enabled: true, sessionToken: 'test-session-token' })
      if (method === 'GET' && url.endsWith('/snapshot')) return jsonResponse(200, { snapshot: baseSnapshot() })
      if (method === 'GET' && url.endsWith('/analysis-queue')) return jsonResponse(200, { items: queue })
      const retryMatch = url.match(/\/analysis-queue\/([^/]+)\/retry$/)
      if (method === 'POST' && retryMatch) {
        retryCalls.push(retryMatch[1])
        queue = []
        return jsonResponse(200, { item: { id: retryMatch[1], status: 'done' } })
      }
      return jsonResponse(404, { error: 'not-found' })
    })

    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    expect(await screen.findByText(/model unavailable/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }))

    await waitFor(() => expect(retryCalls).toEqual(['analysis-1']))
    await waitFor(() => expect(screen.queryByText(/model unavailable/)).not.toBeInTheDocument())
  })

  it('refreshes and reports rather than silently retrying when an action hits a stale revision', async () => {
    let actionAttempts = 0
    const stub = createMemoryFetchStub({
      snapshot: baseSnapshot(),
      onAction: () => {
        actionAttempts += 1
        return { status: 409, body: { error: 'revision-conflict', message: 'Project memory changed. Refresh and try again.' } }
      },
    })
    render(<Harness projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }))
    const row = (await screen.findByText(developmentCandidate.claim)).closest('article') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }))

    expect(await screen.findByText(/Project memory changed since this loaded/i)).toBeInTheDocument()
    expect(actionAttempts).toBe(1)

    const snapshotCalls = stub.calls.filter(call => call.method === 'GET' && call.url.endsWith('/snapshot'))
    expect(snapshotCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps a shared conflict-count readout (e.g. an App-level banner) in sync with an action taken in this surface — no separate refresh needed', async () => {
    const stub = createMemoryFetchStub({
      snapshot: baseSnapshot(),
      onAction: () => ({
        status: 200,
        body: { snapshot: baseSnapshot({ revision: 6, conflicts: [{ ...openConflict, status: 'resolved', resolution: 'not-conflict' }] }) },
      }),
    })
    render(<HarnessWithBanner projectId="story-project-1" onExit={vi.fn()} fetchImpl={stub.fetchImpl} />)

    await screen.findByRole('tab', { name: 'Review' })
    expect(await screen.findByTestId('banner-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('tab', { name: 'Review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'False positive' }))

    await waitFor(() => expect(screen.getByTestId('banner-count')).toHaveTextContent('0'))
  })
})
