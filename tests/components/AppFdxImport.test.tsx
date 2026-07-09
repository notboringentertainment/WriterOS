import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'

const fdxSource = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. LAB - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>Machines hum in the dark.</Text></Paragraph>
  </Content>
</FinalDraft>`

describe('App FDX import', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
  })

  it('imports a Final Draft file from Home as a new Script project', async () => {
    render(<App />)

    const file = new File([fdxSource], 'Imported Pilot.fdx', { type: 'application/xml' })
    fireEvent.change(screen.getByTestId('home-fdx-import-input'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('script-tab-surface')).toBeInTheDocument()
    })

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.meta.title).toBe('Imported Pilot')
    expect(stored.script.rawHtml).toContain('INT. LAB - NIGHT')
    expect(stored.script.rawHtml).toContain('Machines hum in the dark.')
    expect(stored.script.scenes).toEqual([
      expect.objectContaining({ heading: 'INT. LAB - NIGHT', index: 1 }),
    ])
    expect(stored.meta.sourceImport).toMatchObject({
      kind: 'fdx',
      originalFilename: 'Imported Pilot.fdx',
    })
    expect(JSON.stringify(stored)).not.toContain(fdxSource)
  })

  it('imports a Final Draft file from Script as a new project that appears on Home', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

    const file = new File([fdxSource], 'Script Import.fdx', { type: 'application/xml' })
    fireEvent.change(screen.getByTestId('script-fdx-import-input'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
      expect(stored.meta.title).toBe('Script Import')
    })

    const library = JSON.parse(localStorage.getItem('writeros_project_library')!)
    expect(library).toHaveLength(2)
    expect(library[0].state.meta.title).toBe('Script Import')
    expect(library[1].state.meta.title).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    const list = screen.getByLabelText('Project list')
    expect(list).toHaveTextContent('Script Import')
    expect(list).toHaveTextContent('Untitled Project')
  })

  it('surfaces import warnings after Home import lands in Script', async () => {
    render(<App />)

    const sourceWithUnknownType = `<?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. LAB - NIGHT</Text></Paragraph>
          <Paragraph Type="New Act"><Text>The new act begins.</Text></Paragraph>
        </Content>
      </FinalDraft>`
    const file = new File([sourceWithUnknownType], 'Unknown Block.fdx', { type: 'application/xml' })
    fireEvent.change(screen.getByTestId('home-fdx-import-input'), {
      target: { files: [file] },
    })

    expect(await screen.findByText('1 import warning')).toBeInTheDocument()
    expect(screen.getByText('Unknown Final Draft paragraph type "New Act" imported as Action.')).toBeInTheDocument()
  })

  it('leaves the current project untouched after a failed Home import', async () => {
    render(<App />)
    const before = localStorage.getItem('writeros_project_state')
    const file = new File(['<FinalDraft><Content>'], 'Broken.fdx', { type: 'application/xml' })

    fireEvent.change(screen.getByTestId('home-fdx-import-input'), {
      target: { files: [file] },
    })

    expect(await screen.findByText('This file is not valid Final Draft XML.')).toBeInTheDocument()
    expect(localStorage.getItem('writeros_project_state')).toBe(before)
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })
})
