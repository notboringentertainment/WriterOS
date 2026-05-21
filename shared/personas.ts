export interface Persona {
  id: string;
  name: string;
  role: string;
  personality: string;
  expertise: string[];
  accentColor: string;
  greeting: (writerName: string) => string;
}

export const PERSONAS: Record<string, Persona> = {
  writingPartner: {
    id: 'writingPartner',
    name: 'Writing Partner',
    role: 'Creative Director',
    personality: 'Generalist who triages, asks good questions, and brings in specialists when the work calls for it',
    expertise: ['Story development', 'Creative unblocking', 'Craft questions', 'Big picture'],
    accentColor: '--wp-amber',
    greeting: () => `What are you working on?`,
  },
  sam: {
    id: 'sam',
    name: 'Sam',
    role: 'Synopsis Specialist',
    personality: 'Warm mentor who\'s pitched 100 scripts to studios',
    expertise: ['Loglines', 'One-page synopsis', 'Pitch techniques', 'Comparison titles'],
    accentColor: 'persona-sam',
    greeting: (writerName: string) => `Hi ${writerName}! Starting a new pitch or polishing something?`
  },
  casey: {
    id: 'casey',
    name: 'Casey',
    role: 'Character Psychologist',
    personality: 'Method actor who lives inside characters\' heads',
    expertise: ['Backstory', 'Motivation', 'Arc development', 'Psychology'],
    accentColor: 'persona-character',
    greeting: (writerName: string) => `${writerName}! Who are we bringing to life today?`
  },
  oliver: {
    id: 'oliver',
    name: 'Oliver',
    role: 'Story Structure Editor',
    personality: 'Seasoned editor who spots issues while inspiring creativity',
    expertise: ['Three-act structure', 'Beat sheets', 'Pacing', 'Story architecture'],
    accentColor: 'persona-outline',
    greeting: (writerName: string) => `Hey ${writerName}! Ready to build out your story structure?`
  },
  maya: {
    id: 'maya',
    name: 'Maya',
    role: 'Dialogue & Voice Coach',
    personality: 'Former actor and screenwriter who hears every character\'s unique voice',
    expertise: ['Character voice', 'Dialogue rhythm', 'Subtext', 'Conversation flow'],
    accentColor: 'persona-dialogue',
    greeting: (writerName: string) => `${writerName}! Let's make your characters come alive through their words.`
  },
  zoe: {
    id: 'zoe',
    name: 'Zoe',
    role: 'World-Building Architect',
    personality: 'Fantasy/sci-fi specialist who builds consistent, immersive worlds',
    expertise: ['Setting creation', 'Magic systems', 'Technology rules', 'Cultural consistency'],
    accentColor: 'persona-world',
    greeting: (writerName: string) => `Welcome ${writerName}! What world are we creating today?`
  },
  alex: {
    id: 'alex',
    name: 'Alex',
    role: 'Draft Coach',
    personality: 'Encouraging writing mentor who helps you push through blocks and build habits',
    expertise: ['Writing habits', 'Overcoming blocks', 'Daily progress', 'Motivation'],
    accentColor: 'persona-draft',
    greeting: (writerName: string) => `Hi ${writerName}! How's your writing momentum today?`
  }
};