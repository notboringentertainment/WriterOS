import { createEmptyTreatmentContent, type TreatmentDocumentContent } from '../../../shared/documents'

// Synthetic Treatment fixture (no external template files committed).
// Rich: engine + all four movements + named characters + visual texture.
export function buildSyntheticTreatment(): TreatmentDocumentContent {
  const content = createEmptyTreatmentContent()
  content.logline = 'When the tide swallows her city, a salvage diver discovers the flood was an act of murder and the killer is still holding the water.'
  content.concept = {
    premise: 'A drowned city refuses to die, and the woman who maps its ruins learns it was killed on purpose.',
    tone: 'Grounded eerie thriller; wet, cold, patient.',
    theme: 'What we bury comes back as weather.',
    emotionalPromise: 'The dread of deep water and the relief of surfacing with the truth.',
  }
  content.mainCharacters = [
    {
      id: 'mara', name: 'Mara Voss', role: 'Salvage diver, protagonist',
      externalWant: 'Recover her brother’s body from the flooded archive.',
      internalNeed: 'To stop blaming herself for staying ashore.',
      flawOrWound: 'She dives alone and tells no one where.',
      secretOrContradiction: 'She sold the survey data that marked the seawall weak.',
      arc: 'From solitary scavenger to the one who drains the truth.',
      relationshipPressure: 'Her brother’s widow runs the relief office that pays her.',
    },
    {
      id: 'oren', name: 'Oren Halle', role: 'Water authority chief, antagonist',
      externalWant: 'Keep the city submerged and the salvage rights his.',
      internalNeed: '', flawOrWound: '', secretOrContradiction: '',
      arc: '', relationshipPressure: '',
    },
  ]
  content.prose = {
    opening: 'Mara dives the drowned cathedral at dawn and finds a fresh corpse zip-tied to the bell cage — a city engineer who vanished the night of the flood.',
    actOne: 'The police call it a salvage accident. Mara matches the zip ties to water authority stock and learns the engineer had filed a report on the seawall — the report she helped bury. She takes the salvage contract to get back inside the flooded records hall.',
    actTwo: 'Every file she raises is already wet-shredded; someone is diving ahead of her. Oren offers her exclusive rights to the deep wards, a bribe dressed as mercy. When her air line is cut at depth, she survives by breathing from a sunken office pocket and stops trusting the surface.',
    actThree: 'Mara lures Oren into the archive at low tide with the one file he never found — her own confession. She floods the chamber on a timer she controls, forces his recorded admission, and surfaces with both truths: his murder and her sale. The city begins to drain.',
    customSections: [
      {
        id: 'bellscene', heading: 'The Bell Toll',
        body: 'Midpoint set piece: the cathedral bell, loosened by salvage, tolls underwater for the first time since the flood — every diver in the bay hears the city speak.',
      },
    ],
  }
  content.visualAndTonal = {
    overallTone: 'Cold light, held breath, procedural calm over grief.',
    visualWorld: 'A skyline at periscope depth: rooftops as islands, streetlights still burning underwater on the old grid.',
    recurringImagesOrMotifs: 'Air bubbles in stairwells; paper turning to silt; the bell cage.',
    musicOrSoundFeeling: 'Hydrophone hum, regulator breath as percussion.',
    pacing: 'Slow descents, fast surfacings.',
    genreRules: 'No supernatural — every horror has a permit trail.',
    compsAndReferences: 'The Vanishing meets Chinatown underwater.',
  }
  content.openQuestions.story = ['Does the widow know about the survey sale?']
  return content
}

export const syntheticTreatment: TreatmentDocumentContent = buildSyntheticTreatment()
