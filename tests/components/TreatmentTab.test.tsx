import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { TreatmentTab } from '../../client/src/components/writing/TreatmentTab'
import {
  createEmptyTreatmentContent,
  DOCUMENT_SCHEMA_VERSION,
  type AuthoredDocumentState,
  type TreatmentDocumentContent,
} from '@shared/documents'
import { syntheticTreatment } from '../fixtures/treatment/syntheticTreatment'
import { computeTreatmentSourceHash } from '../../shared/compose/treatmentSourceHash'
import { getTreatmentRecipe } from '../../shared/compose/treatmentRecipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'

function makeDocument(
  override: Partial<TreatmentDocumentContent> = {},
  viewPreferences?: AuthoredDocumentState<TreatmentDocumentContent>['viewPreferences'],
): AuthoredDocumentState<TreatmentDocumentContent> {
  return {
    version: DOCUMENT_SCHEMA_VERSION,
    mode: 'three_act_prose',
    updatedAt: new Date('2026-05-20').toISOString(),
    content: {
      ...createEmptyTreatmentContent(),
      ...override,
    },
    viewPreferences,
  }
}

function emptyCharacter(id: string): TreatmentDocumentContent['mainCharacters'][number] {
  return {
    id,
    name: '',
    role: '',
    externalWant: '',
    internalNeed: '',
    flawOrWound: '',
    secretOrContradiction: '',
    arc: '',
    relationshipPressure: '',
  }
}

function withPassage(
  body: string,
): Partial<TreatmentDocumentContent> {
  return {
    prose: {
      ...createEmptyTreatmentContent().prose,
      customSections: [{ id: 'p1', heading: 'Major turn', body }],
    },
  }
}

describe('TreatmentTab', () => {
  it('renders plain-language treatment questions', () => {
    render(
      <TreatmentTab
        document={makeDocument()}
        onContentChange={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByText('Treatment')).toBeInTheDocument()
    expect(screen.getByText('What is the story in one sentence?')).toBeInTheDocument()
    expect(screen.getByText('How does the story open on screen?')).toBeInTheDocument()
    expect(screen.getByText('How does it resolve?')).toBeInTheDocument()
  })

  it('renders the composed Document View when viewPreferences.activeView is document', () => {
    const content = createEmptyTreatmentContent()
    content.logline = 'A medic hears impossible rescue calls.'
    content.prose.opening = 'Mara ends a night shift as the silent line rings.'

    render(
      <TreatmentTab
        document={makeDocument(content, { activeView: 'document' })}
        onContentChange={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // Sparse content → below-readiness composer state, not the old stored-answer render.
    expect(screen.getByText(/add a few more answers before composing your treatment/i)).toBeInTheDocument()
    expect(screen.queryByText('A medic hears impossible rescue calls.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('What is the story in one sentence?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear treatment' })).not.toBeInTheDocument()
  })

  it('clicking Document fires a view preference patch', () => {
    const onViewPreferencesPatch = vi.fn()
    render(
      <TreatmentTab
        document={makeDocument()}
        onContentChange={vi.fn()}
        onViewPreferencesPatch={onViewPreferencesPatch}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Document' }))

    expect(onViewPreferencesPatch).toHaveBeenCalledWith({ activeView: 'document' })
  })

  it('clicking Edit fires a view preference patch', () => {
    const onViewPreferencesPatch = vi.fn()
    render(
      <TreatmentTab
        document={makeDocument({}, { activeView: 'document' })}
        onContentChange={vi.fn()}
        onViewPreferencesPatch={onViewPreferencesPatch}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(onViewPreferencesPatch).toHaveBeenCalledWith({ activeView: 'edit' })
  })

  it('writes logline edits through the provided content updater', () => {
    const onContentChange = vi.fn()
    const document = makeDocument()
    render(
      <TreatmentTab
        document={document}
        onContentChange={onContentChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('What is the story in one sentence?'), {
      target: { value: 'A medic hears impossible rescue calls.' },
    })

    const updater = onContentChange.mock.calls[0][0]
    expect(updater(document.content).logline).toBe('A medic hears impossible rescue calls.')
  })

  it('adds an editable treatment character', () => {
    const onContentChange = vi.fn()
    const document = makeDocument()
    render(
      <TreatmentTab
        document={document}
        onContentChange={onContentChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add character' }))

    const updater = onContentChange.mock.calls[0][0]
    const next = updater(document.content)
    expect(next.mainCharacters).toHaveLength(1)
    expect(next.mainCharacters[0]).toMatchObject({
      name: '',
      role: '',
      externalWant: '',
      internalNeed: '',
    })
  })

  it('confirms before clearing treatment content', () => {
    const onClear = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <TreatmentTab
        document={makeDocument({ logline: 'A medic hears impossible rescue calls.' })}
        onContentChange={vi.fn()}
        onClear={onClear}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear treatment' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onClear).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('asks each feeling question once with no duplicate label', () => {
    render(<TreatmentTab document={makeDocument()} onContentChange={vi.fn()} />)

    expect(screen.queryByText('What should it feel like?')).not.toBeInTheDocument()
    expect(screen.getByText('What kind of story is this?')).toBeInTheDocument()
    expect(screen.getByText('What should the audience feel by the end?')).toBeInTheDocument()
    expect(screen.getByText("What's the atmosphere from scene to scene?")).toBeInTheDocument()
  })

  it('surfaces every texture field', () => {
    render(<TreatmentTab document={makeDocument()} onContentChange={vi.fn()} />)

    expect(screen.getByText('What images or motifs keep returning?')).toBeInTheDocument()
    expect(screen.getByText('What should it sound like?')).toBeInTheDocument()
    expect(screen.getByText('What does this remind people of?')).toBeInTheDocument()
  })

  it('writes texture edits for newly surfaced fields', () => {
    const onContentChange = vi.fn()
    const document = makeDocument()
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.change(screen.getByLabelText('What should it sound like?'), {
      target: { value: 'A low hum under every scene.' },
    })

    const updater = onContentChange.mock.calls[0][0]
    expect(updater(document.content).visualAndTonal.musicOrSoundFeeling).toBe(
      'A low hum under every scene.',
    )
  })

  it('renders the story passages section with a template picker', () => {
    render(<TreatmentTab document={makeDocument()} onContentChange={vi.fn()} />)

    expect(screen.getByText('Story passages')).toBeInTheDocument()
    expect(screen.getByLabelText('Add a passage')).toBeInTheDocument()
  })

  it('inserts a passage with the template heading and an empty body', () => {
    const onContentChange = vi.fn()
    const document = makeDocument()
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.change(screen.getByLabelText('Add a passage'), {
      target: { value: 'character' },
    })

    const updater = onContentChange.mock.calls[0][0]
    const next = updater(document.content)
    expect(next.prose.customSections).toHaveLength(1)
    expect(next.prose.customSections[0].heading).toBe('Character passage')
    expect(next.prose.customSections[0].body).toBe('')
  })

  it('shows template placeholder guidance in an empty passage body', () => {
    const document = makeDocument({
      prose: {
        ...createEmptyTreatmentContent().prose,
        customSections: [{ id: 'p1', heading: 'Character passage', body: '' }],
      },
    })
    render(<TreatmentTab document={document} onContentChange={vi.fn()} />)

    expect(screen.getByLabelText('Passage body')).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/follow one character/i),
    )
  })

  it('removes an empty passage without confirmation', () => {
    const onContentChange = vi.fn()
    const document = makeDocument(withPassage(''))
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove passage' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    const updater = onContentChange.mock.calls[0][0]
    expect(updater(document.content).prose.customSections).toHaveLength(0)
    confirmSpy.mockRestore()
  })

  it('confirms before removing a passage that has text', () => {
    const onContentChange = vi.fn()
    const document = makeDocument(withPassage('She turns the car around.'))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove passage' }))

    expect(confirmSpy).toHaveBeenCalled()
    const updater = onContentChange.mock.calls[0][0]
    expect(updater(document.content).prose.customSections).toHaveLength(0)
    confirmSpy.mockRestore()
  })

  it('keeps a passage when removal is cancelled', () => {
    const onContentChange = vi.fn()
    const document = makeDocument(withPassage('She turns the car around.'))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove passage' }))

    expect(onContentChange).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('removes an empty character without confirmation', () => {
    const onContentChange = vi.fn()
    const document = makeDocument({ mainCharacters: [emptyCharacter('c1')] })
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove character' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    const updater = onContentChange.mock.calls[0][0]
    expect(updater(document.content).mainCharacters).toHaveLength(0)
    confirmSpy.mockRestore()
  })

  it('confirms before removing a character that has text', () => {
    const onContentChange = vi.fn()
    const document = makeDocument({
      mainCharacters: [{ ...emptyCharacter('c1'), name: 'Mara' }],
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TreatmentTab document={document} onContentChange={onContentChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove character' }))

    expect(confirmSpy).toHaveBeenCalled()
    const updater = onContentChange.mock.calls[0][0]
    expect(updater(document.content).mainCharacters).toHaveLength(0)
    confirmSpy.mockRestore()
  })

  it('collapses and expands a prose passage', () => {
    render(<TreatmentTab document={makeDocument()} onContentChange={vi.fn()} />)

    expect(screen.getByLabelText('How does the story open on screen?')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse' })[0])
    expect(screen.queryByLabelText('How does the story open on screen?')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[0])
    expect(screen.getByLabelText('How does the story open on screen?')).toBeInTheDocument()
  })

  it('collapses a story passage to hide its body', () => {
    const document = makeDocument(withPassage('She turns the car around.'))
    render(<TreatmentTab document={document} onContentChange={vi.fn()} />)

    expect(screen.getByLabelText('Passage body')).toBeInTheDocument()

    const collapseButtons = screen.getAllByRole('button', { name: 'Collapse' })
    fireEvent.click(collapseButtons[collapseButtons.length - 1])

    expect(screen.queryByLabelText('Passage body')).not.toBeInTheDocument()
  })
})

describe('TreatmentTab — Document view composition', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const identity = { title: 'Tidewrack', genre: 'Thriller' }

  function cleanComposed(): ComposedDocument {
    return {
      schemaVersion: COMPOSED_SCHEMA_VERSION,
      generatedAt: '2026-06-12T00:00:00.000Z',
      model: 'test-model',
      recipeVersion: getTreatmentRecipe('feature').recipeVersion,
      composerVersion: COMPOSER_VERSION,
      sourceHash: computeTreatmentSourceHash(syntheticTreatment, 'feature', identity),
      format: 'feature',
      blocks: [
        { type: 'heading', text: 'Logline' },
        { type: 'logline', text: 'Mara Voss dives a drowned city and surfaces with proof of murder.', sourceFieldIds: ['logline'] },
      ],
      fidelity: { status: 'clean', warnings: [] },
    }
  }

  function DocumentHarness() {
    const [doc, setDoc] = useState<AuthoredDocumentState<TreatmentDocumentContent>>(() => ({
      ...makeDocument(syntheticTreatment, { activeView: 'document' }),
    }))
    return (
      <TreatmentTab
        document={doc}
        projectFormat="feature"
        identity={identity}
        onContentChange={vi.fn()}
        onViewPreferencesPatch={(patch) => setDoc((d) => ({ ...d, viewPreferences: { ...d.viewPreferences, ...patch } }))}
        onComposed={(composed) => setDoc((d) => ({ ...d, composed }))}
        onClear={vi.fn()}
      />
    )
  }

  it('shows the Compose CTA for a ready treatment and composes on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: cleanComposed() }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    const cta = screen.getByRole('button', { name: /compose this treatment/i })
    expect(cta).toBeEnabled()

    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText(/Mara Voss dives a drowned city/)).toBeInTheDocument())
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body).surface).toBe('treatment')
  })

  it('ignores duplicate compose clicks while a request is in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: cleanComposed() }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    const cta = screen.getByRole('button', { name: /compose this treatment/i })
    fireEvent.click(cta)
    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText(/Mara Voss dives a drowned city/)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows error/retry when the compose request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    fireEvent.click(screen.getByRole('button', { name: /compose this treatment/i }))

    await waitFor(() => expect(screen.getByText(/could not compose/i)).toBeInTheDocument())
    expect(screen.queryByText('Composing…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('keeps the Clear button hidden in Document view', () => {
    render(<DocumentHarness />)
    expect(screen.queryByRole('button', { name: /clear treatment/i })).not.toBeInTheDocument()
  })
})
