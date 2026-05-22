import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TreatmentDocumentView } from '../../client/src/components/writing/treatment/TreatmentDocumentView'
import { createEmptyTreatmentContent, type TreatmentDocumentContent } from '@shared/documents'

const updatedAt = '2026-05-20T10:00:00.000Z'

function populatedCharacter(): TreatmentDocumentContent['mainCharacters'][number] {
  return {
    id: 'c1',
    name: 'Mara',
    role: 'Paramedic',
    externalWant: 'Find the caller before another patient vanishes.',
    internalNeed: 'Trust help before she burns out.',
    flawOrWound: 'She believes every loss is her fault.',
    secretOrContradiction: 'She keeps answering calls no one else can hear.',
    arc: 'She moves from solitary rescue to shared command.',
    relationshipPressure: 'Her partner thinks the calls are a symptom.',
  }
}

describe('TreatmentDocumentView', () => {
  it('renders authored treatment material as a clean readable document', () => {
    const content = createEmptyTreatmentContent()
    content.header = {
      title: 'Night Line',
      writer: 'Ben Crane',
      format: 'feature',
      genre: 'Supernatural thriller',
      version: 'Draft 1',
      date: 'May 2026',
    }
    content.logline = 'A medic hears impossible calls from missing patients.'
    content.concept = {
      premise: 'A city rescue line starts taking calls from the dead.',
      tone: 'Grounded procedural dread.',
      theme: 'Mercy has a cost.',
      emotionalPromise: 'A haunted rescue story that ends in earned release.',
    }
    content.mainCharacters = [populatedCharacter()]
    content.prose.opening = 'Mara ends a night shift.\n\nThe phone rings from a dead ward.'
    content.prose.actOne = 'She follows the first impossible call into a sealed hospital wing.'
    content.prose.customSections = [
      { id: 'turn', heading: 'Major Turn', body: 'Isaiah answers from inside the emergency network.' },
    ]
    content.visualAndTonal.musicOrSoundFeeling = 'Analog pulse under emergency-line static.'

    render(<TreatmentDocumentView content={content} projectFormat="series" updatedAt={updatedAt} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Night Line' })).toBeInTheDocument()
    expect(screen.getByText('A medic hears impossible calls from missing patients.')).toBeInTheDocument()
    expect(screen.getByText('WRITER')).toBeInTheDocument()
    expect(screen.getByText('Ben Crane')).toBeInTheDocument()
    expect(screen.getByText('Series')).toBeInTheDocument()
    expect(screen.getByText('A city rescue line starts taking calls from the dead.')).toBeInTheDocument()
    expect(screen.getByText('Mara')).toBeInTheDocument()
    expect(screen.getByText('Paramedic')).toBeInTheDocument()
    expect(screen.getByText('Mara ends a night shift.')).toBeInTheDocument()
    expect(screen.getByText('The phone rings from a dead ward.')).toBeInTheDocument()
    expect(screen.getByText('Major Turn')).toBeInTheDocument()
    expect(screen.getByText('Analog pulse under emergency-line static.')).toBeInTheDocument()

    expect(screen.queryByText('What is the story in one sentence?')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('excludes empty template passages, open questions, and AI production notes', () => {
    const content = createEmptyTreatmentContent()
    content.logline = 'A medic hears impossible calls.'
    content.prose.customSections = [
      { id: 'empty-free', heading: 'New passage', body: '' },
      { id: 'side-thread', heading: 'Side Thread', body: 'Mara lies to her partner to keep listening.' },
    ]
    content.openQuestions.story = ['Should the rescue network feel benevolent or predatory?']
    content.openQuestions.production = ['Can the impossible calls be represented without expensive VFX?']
    content.aiProductionImplications = {
      visualSequenceRisks: 'Avoid a costly crowd sequence.',
      characterContinuityRisks: 'Track Mara phone handoffs.',
      locationContinuityRisks: 'Hospital geography changes.',
      vfxOrGenerationChallenges: 'Impossible callers require spectral assets.',
      referenceAssetsNeeded: 'Emergency dispatch boards.',
    }

    render(<TreatmentDocumentView content={content} updatedAt={updatedAt} />)

    expect(screen.getByText('Side Thread')).toBeInTheDocument()
    expect(screen.getByText('Mara lies to her partner to keep listening.')).toBeInTheDocument()
    expect(screen.queryByText('New passage')).not.toBeInTheDocument()
    expect(screen.queryByText('Should the rescue network feel benevolent or predatory?')).not.toBeInTheDocument()
    expect(screen.queryByText('Can the impossible calls be represented without expensive VFX?')).not.toBeInTheDocument()
    expect(screen.queryByText('Avoid a costly crowd sequence.')).not.toBeInTheDocument()
    expect(screen.queryByText(/open questions/i)).not.toBeInTheDocument()
  })

  it('renders a quiet empty state without default format metadata', () => {
    render(<TreatmentDocumentView content={createEmptyTreatmentContent()} updatedAt={updatedAt} />)

    expect(screen.getByText('No authored treatment content yet.')).toBeInTheDocument()
    expect(screen.queryByText('FORMAT')).not.toBeInTheDocument()
    expect(screen.getByText(`Last edited ${new Date(updatedAt).toLocaleDateString()}`)).toBeInTheDocument()
  })
})
