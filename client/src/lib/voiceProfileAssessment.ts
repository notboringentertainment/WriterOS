export interface VoiceProfileAssessmentQuestion {
  id: string
  text: string
}

export interface VoiceProfileAssessmentSection {
  id: string
  title: string
  questions: VoiceProfileAssessmentQuestion[]
}

export const VOICE_PROFILE_ASSESSMENT_SECTIONS: VoiceProfileAssessmentSection[] = [
  {
    id: 'origins',
    title: 'Origins',
    questions: [
      {
        id: 'q1',
        text: 'When a story idea hits you, what is the first thing you see: a character, a situation, an image, a moral question, or a piece of dialogue?',
      },
      {
        id: 'q2',
        text: 'Name three writers or directors whose work makes you say "that is the shape of mine." For each, what is the one specific thing they do that you are trying to do?',
      },
      {
        id: 'q3',
        text: 'Pick a project you have worked on. Walk through how it started: the original spark, and what it looked like before it became the thing.',
      },
    ],
  },
  {
    id: 'character',
    title: 'Character',
    questions: [
      {
        id: 'q4',
        text: 'Describe a protagonist you could not sanitize even when you knew you should. What is their worst trait, and why would you not fix it?',
      },
      {
        id: 'q5',
        text: 'When you sit down with a new character, what do you build first: backstory, voice, wound, lie, face, or something else?',
      },
      {
        id: 'q6',
        text: 'Tell me about a supporting character, animal, or object in your work that earned more attention than you originally planned. Why did it refuse to stay small?',
      },
    ],
  },
  {
    id: 'conflict-tone',
    title: 'Conflict And Tone',
    questions: [
      {
        id: 'q7',
        text: 'Where do you stand on humor in serious work: survival, leverage, distance, weapon, or something else? Name a moment in your writing where it did real work.',
      },
      {
        id: 'q8',
        text: 'When two of your characters disagree, do you tend to know who is right, or do you write both sides honestly enough that you are not sure?',
      },
      {
        id: 'q9',
        text: 'What kind of ending do you find yourself drawn to: resolved, ambiguous, bittersweet, tragic, or something else? What kind do you actively avoid?',
      },
    ],
  },
  {
    id: 'world-symbol',
    title: 'World And Symbol',
    questions: [
      {
        id: 'q10',
        text: 'Does your work tend to have an object, system, curse, or piece of technology that carries metaphorical weight beyond its plot function? Describe one.',
      },
      {
        id: 'q11',
        text: 'How much lore is too much lore? When does worldbuilding stop serving the story?',
      },
      {
        id: 'q12',
        text: 'When a real-world detail shows up in your work, how much accuracy do you demand? Where is your line between fidelity and friction?',
      },
    ],
  },
  {
    id: 'voice-craft',
    title: 'Voice And Craft',
    questions: [
      {
        id: 'q13',
        text: 'Paste a few sentences of your action description: the kind you would actually shoot. What are you doing on the page that you would push back on if an AI did it?',
      },
      {
        id: 'q14',
        text: 'Pick a flavor of bad prose you cannot stand. Purple, hollow, try-hard, generic, or something else? Why does that one bother you?',
      },
      {
        id: 'q15',
        text: 'How do you handle the gap between what a character says and what they mean? Give a specific example from something you have written.',
      },
    ],
  },
  {
    id: 'engine',
    title: 'Engine',
    questions: [
      {
        id: 'q16',
        text: 'Why do you write? Not what got you into it: what makes you sit down today?',
      },
      {
        id: 'q17',
        text: 'Are there themes or wounds you find yourself returning to without meaning to? What are they?',
      },
      {
        id: 'q18',
        text: 'If your characters could see how you see yourself, would they recognize you, or are they everything you wish you were?',
      },
    ],
  },
  {
    id: 'collaboration',
    title: 'Collaboration',
    questions: [
      {
        id: 'q19',
        text: 'When a collaborator gives you a note, what kind of note makes you sit up? What kind makes you tune out?',
      },
      {
        id: 'q20',
        text: 'What is something other AI assistants do that drives you up a wall?',
      },
    ],
  },
]

export const VOICE_PROFILE_ASSESSMENT_QUESTIONS = VOICE_PROFILE_ASSESSMENT_SECTIONS.flatMap(section => section.questions)

export function countAnsweredAssessmentQuestions(answers: Record<string, string>): number {
  return VOICE_PROFILE_ASSESSMENT_QUESTIONS.filter(question => answers[question.id]?.trim()).length
}

export function cleanAssessmentAnswers(answers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0)
  )
}
