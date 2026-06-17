import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'

// Integration proof: the real App UI path must put a Surface Awareness Contract on the
// /api/wp-chat request when the Outline page is open — for BOTH the left-rail Writing
// Partner and the Writer's Room specialist. (Reproduces the live manual test.)

function mockFetchCapturing() {
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    if (String(url).includes('/api/wp-chat')) {
      return { ok: true, status: 200, json: async () => ({ message: 'ok', suggestions: [] }) } as Response
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function wpChatBody(fetchMock: ReturnType<typeof mockFetchCapturing>) {
  const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/api/wp-chat'))
  if (!call) throw new Error('no /api/wp-chat request was sent')
  return JSON.parse((call[1] as RequestInit).body as string)
}

describe('App surface awareness — live request path', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('left-rail Writing Partner on Outline sends an intake surface with the first question', async () => {
    const fetchMock = mockFetchCapturing()
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    fireEvent.click(screen.getByTitle('Morgan')) // open the rail

    const input = screen.getByPlaceholderText('Message Morgan…')
    fireEvent.change(input, { target: { value: 'What is the first question on this page?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/api/wp-chat'))).toBe(true))

    const body = wpChatBody(fetchMock)
    expect(body.projectContext.surface.kind).toBe('intake')
    expect(body.projectContext.surface.surface).toBe('outline')
    expect(body.projectContext.surface.nextQuestion.label).toBe('Who are we following?')
  })

  it('Writer’s Room specialist on Outline sends an intake surface with the first question', async () => {
    const fetchMock = mockFetchCapturing()
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    fireEvent.click(screen.getByRole('tab', { name: "Writer's Room" }))
    fireEvent.click(screen.getAllByText('Zoe')[0]) // select the Zoe specialist

    const input = screen.getByPlaceholderText('Message Zoe…')
    fireEvent.change(input, { target: { value: 'What is the first question on this page?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/api/wp-chat'))).toBe(true))

    const body = wpChatBody(fetchMock)
    expect(body.projectContext.surface.kind).toBe('intake')
    expect(body.projectContext.surface.surface).toBe('outline')
    expect(body.projectContext.surface.nextQuestion.label).toBe('Who are we following?')
  })
})
