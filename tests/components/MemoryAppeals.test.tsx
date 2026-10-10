import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemorySurface } from '../../client/src/components/memory/MemorySurface'
import { useProjectMemory } from '../../client/src/lib/useProjectMemory'
import type { ProjectMemorySnapshot } from '@shared/projectMemory'

afterEach(cleanup)

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

const snapshot: ProjectMemorySnapshot = {
  projectId: 'story-project-1',
  revision: 1,
  records: [],
  conflicts: [],
  sources: [],
} as unknown as ProjectMemorySnapshot

function Harness({ appeals }: { appeals: Response | Error }) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/project-library/bootstrap') return jsonResponse(200, { enabled: true, sessionToken: 'tok' })
    if (url.endsWith('/snapshot')) return jsonResponse(200, { snapshot })
    if (url.endsWith('/analysis-queue')) return jsonResponse(200, { items: [] })
    if (url.endsWith('/appeals')) {
      if (appeals instanceof Error) throw appeals
      return appeals
    }
    return jsonResponse(404, {})
  })
  const memory = useProjectMemory('story-project-1', undefined, fetchImpl)
  return <MemorySurface memory={memory} onExit={() => {}} />
}

describe('Memory review: appeals that have not reached Story-drive', () => {
  it('names the count and the first failure reason', async () => {
    render(
      <Harness
        appeals={jsonResponse(200, {
          pending: 1,
          failed: [{ fileName: 'a.md', error: "This project isn't linked to a Story-drive folder." }],
        })}
      />,
    )
    expect(await screen.findByText(
      "2 appeals haven't reached Story-drive yet: This project isn't linked to a Story-drive folder.",
    )).toBeTruthy()
  })

  it('uses the singular for one appeal', async () => {
    render(<Harness appeals={jsonResponse(200, { pending: 0, failed: [{ fileName: 'a.md', error: 'The folder is offline.' }] })} />)
    expect(await screen.findByText('1 appeal hasn\'t reached Story-drive yet: The folder is offline.')).toBeTruthy()
  })

  it('shows the count without a reason when appeals are only waiting', async () => {
    render(<Harness appeals={jsonResponse(200, { pending: 3, failed: [] })} />)
    expect(await screen.findByText("3 appeals haven't reached Story-drive yet.")).toBeTruthy()
  })

  it('shows nothing when every appeal was delivered', async () => {
    render(<Harness appeals={jsonResponse(200, { pending: 0, failed: [] })} />)
    await screen.findByText('Nothing here yet.')
    expect(screen.queryByText(/Story-drive yet/)).toBeNull()
  })

  it('shows nothing, and the rest of the surface still loads, when the appeals check fails', async () => {
    render(<Harness appeals={new Error('network down')} />)
    await screen.findByText('Nothing here yet.')
    await waitFor(() => expect(screen.queryByText(/Story-drive yet/)).toBeNull())
  })
})
