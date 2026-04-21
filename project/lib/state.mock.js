// =============================================================================
//  lib/state.mock.js  ·  Canonical project state (dev mock)
// -----------------------------------------------------------------------------
//  When a real backend is attached, the shapes below will arrive via
//  `STATE_REPLACE` on the event bus and this file can be deleted.
// =============================================================================

window.WOS = window.WOS || {};

const now = () => new Date().toISOString();

const PROJECT = {
  id: 'proj/long-hallway',
  title: 'The Long Hallway',
  logline: "A night-shift nurse who ignored her sister's last call must live inside her dead sister's apartment to prove she wasn't complicit.",
  genre: 'Literary thriller',
  wordCount: 62400,
  status: 'Six chapters drafted · stuck at midpoint',
  author: 'Alex Chen',
};

const AGENTS = [
  { id: 'triage', name: 'Triage',  role: 'Coordinator',               accent: 'var(--primary)',  letter: 'T', status: 'thinking', focus: 'Routing Alex\'s "midpoint feels hollow" ticket',
    capabilities: ['route', 'delegate', 'summarize'],
    reads:  ['*'], writes: ['tasks', 'handoffs'] },
  { id: 'sam',    name: 'Sam',     role: 'Synopsis Specialist',      accent: 'var(--p-sam)',    letter: 'S', status: 'idle',     focus: 'Logline draft 3 awaiting user review',
    capabilities: ['synopsis', 'logline', 'query-letter', 'comp-titles'],
    reads:  ['project', 'beats', 'characters'], writes: ['project.logline', 'memory'] },
  { id: 'casey',  name: 'Casey',   role: 'Character Psychologist',   accent: 'var(--p-casey)',  letter: 'C', status: 'writing',  focus: "Deepening Ivor's daylight goals (per Marcus note #2)",
    capabilities: ['backstory', 'arc', 'voice'],
    reads:  ['characters', 'scenes', 'memory'], writes: ['characters', 'memory'] },
  { id: 'oliver', name: 'Oliver',  role: 'Structure Editor',         accent: 'var(--p-oliver)', letter: 'O', status: 'waiting',  focus: 'Waiting on Casey — needs Mara\'s wound locked before midpoint',
    capabilities: ['beats', 'pacing', 'outline'],
    reads:  ['beats', 'scenes', 'characters'], writes: ['beats'] },
  { id: 'maya',   name: 'Maya',    role: 'Dialogue & Voice Coach',   accent: 'var(--p-maya)',   letter: 'M', status: 'idle',     focus: 'Scene 14 voice pass queued',
    capabilities: ['dialogue', 'subtext', 'voice-print'],
    reads:  ['scenes', 'characters'], writes: ['scenes', 'memory'] },
  { id: 'zoe',    name: 'Zoe',     role: 'World Architect',          accent: 'var(--p-zoe)',    letter: 'Z', status: 'idle',     focus: 'Two key-rule conflicts flagged · unresolved',
    capabilities: ['canon', 'continuity', 'glossary'],
    reads:  ['worldRules', 'scenes'], writes: ['worldRules', 'memory'] },
  { id: 'marcus', name: 'Marcus',  role: 'Developmental Editor',     accent: 'var(--p-alex)',   letter: 'M', status: 'idle',     focus: 'First-pass notes delivered · 3 dev notes open',
    capabilities: ['dev-edit', 'line-edit', 'scorecard'],
    reads:  ['*'], writes: ['memory', 'tasks'] },
];

const TASKS = [
  { id: 't-001', state: 'live',      title: 'Diagnose midpoint collapse',                    detail: 'Offer three ways Mara can truly fail at beat 7.',              assignedTo: 'oliver', requestedBy: 'user',   tags:['structure','urgent'], blockers:['t-004'], createdAt: now(), dueAt: null, refs:['beat/midpoint'], priority: 3 },
  { id: 't-002', state: 'queued',    title: 'Voice pass · Scene 14 hallway confrontation',   detail: 'Mara and Ivor currently isomorphic on contractions + rhythm.', assignedTo: 'maya',   requestedBy: 'marcus', tags:['dialogue'],           blockers:[],        createdAt: now(), dueAt: null, refs:['scene/14'], priority: 2 },
  { id: 't-003', state: 'review',    title: 'Logline draft 3',                               detail: 'Query-ready, one sentence, under 30 words.',                   assignedTo: 'sam',    requestedBy: 'user',   tags:['pitch'],              blockers:[],        createdAt: now(), dueAt: null, refs:['project'], priority: 1 },
  { id: 't-004', state: 'live',      title: 'Lock Mara\'s wound',                            detail: 'Voicemail scene must be locked before Oliver touches midpoint.', assignedTo: 'casey', requestedBy: 'oliver', tags:['character','blocker'], blockers:[],       createdAt: now(), dueAt: null, refs:['char/mara'], priority: 3 },
  { id: 't-005', state: 'blocked',   title: 'Resolve key-conflict · 10A vs 10B',             detail: 'Scene 22 contradicts the rule set in scene 9.',               assignedTo: 'zoe',    requestedBy: 'marcus', tags:['continuity'],         blockers:[],        createdAt: now(), dueAt: null, refs:['scene/22','rule/keys'], priority: 2 },
  { id: 't-006', state: 'completed', title: 'First developmental pass · ch 1-6',             detail: 'Scorecard delivered. Three big notes attached.',               assignedTo: 'marcus', requestedBy: 'user',   tags:['edit'],               blockers:[],        createdAt: now(), dueAt: null, refs:['ch/1','ch/2','ch/3','ch/4','ch/5','ch/6'], priority: 1 },
  { id: 't-007', state: 'draft',     title: 'Build Ivor dossier',                            detail: 'Casey to surface daylight goal + a cost when Mara intrudes.',  assignedTo: null,     requestedBy: 'marcus', tags:['character'],          blockers:[],        createdAt: now(), dueAt: null, refs:['char/ivor'], priority: 2 },
];

const MEMORY = [
  { id: 'm-001', class:'canon',    text: 'The Hallway = the 10th-floor corridor. Always capitalized.',                                        source:'zoe',    witnesses:['*'],                 refs:['rule/naming'],      confidence: 1.00, createdAt: now(), decay: 0 },
  { id: 'm-002', class:'canon',    text: "Mara's apartment key opens 10B, not 10A.",                                                           source:'zoe',    witnesses:['oliver','maya'],     refs:['rule/keys'],        confidence: 0.98, createdAt: now(), decay: 0 },
  { id: 'm-003', class:'pinned',   text: "Mara's wound: unanswered voicemail the night her sister died.",                                      source:'casey',  witnesses:['oliver','sam','marcus'], refs:['char/mara'],    confidence: 0.95, createdAt: now(), decay: 0 },
  { id: 'm-004', class:'pinned',   text: 'Midpoint must be a true failure, not a setback. (Oliver doctrine.)',                                  source:'oliver', witnesses:['casey','marcus'],    refs:['beat/midpoint'],    confidence: 0.92, createdAt: now(), decay: 0 },
  { id: 'm-005', class:'inferred', text: "Ivor currently functions as a 'suspicious prop'; needs a daylight goal.",                             source:'marcus', witnesses:['casey'],             refs:['char/ivor'],        confidence: 0.74, createdAt: now(), decay: 0 },
  { id: 'm-006', class:'inferred', text: 'Scenes 1, 3 share setup work — possible 14-page cut candidate.',                                      source:'marcus', witnesses:['oliver'],            refs:['scene/1','scene/3'],confidence: 0.66, createdAt: now(), decay: 0 },
  { id: 'm-007', class:'general',  text: "Voicemail has never been played 'on-page' by end of chapter 6.",                                     source:'marcus', witnesses:['casey'],             refs:['char/mara'],        confidence: 0.80, createdAt: now(), decay: 0.1 },
  { id: 'm-008', class:'general',  text: "Mara uses contractions; Ivor does not. (Maya's only locked voice rule so far.)",                     source:'maya',   witnesses:['casey'],             refs:['char/mara','char/ivor'], confidence: 0.85, createdAt: now(), decay: 0.05 },
  { id: 'm-009', class:'decaying', text: 'Author considered cutting Detective Park subplot in session 2025-11-14.',                            source:'user',   witnesses:['oliver'],            refs:['char/park'],        confidence: 0.30, createdAt: now(), decay: 0.7 },
];

const HANDOFFS = [
  { id:'h-001', from:'user',   to:'triage', summary:'I\'m stuck at the midpoint.',                                              artifacts:[],                                    createdAt:now(), state:'completed' },
  { id:'h-002', from:'triage', to:'marcus', summary:'Request scorecard on chapters 1-6 before anyone else moves.',               artifacts:['ch/1..ch/6'],                        createdAt:now(), state:'completed' },
  { id:'h-003', from:'marcus', to:'casey',  summary:'Ivor flat — daylight goal needed; also Mara\'s wound unstated on-page.',   artifacts:['char/ivor','char/mara'],             createdAt:now(), state:'accepted' },
  { id:'h-004', from:'casey',  to:'oliver', summary:'Mara\'s wound candidate: unanswered voicemail. Locking today.',              artifacts:['char/mara','m-003'],                 createdAt:now(), state:'pending' },
  { id:'h-005', from:'marcus', to:'zoe',    summary:'Two key-rule contradictions — verify and propose fix path.',                artifacts:['rule/keys','scene/9','scene/22'],    createdAt:now(), state:'accepted' },
  { id:'h-006', from:'marcus', to:'maya',   summary:'Scene 14 voice collapse — two characters reading identically.',             artifacts:['scene/14'],                          createdAt:now(), state:'pending' },
];

const SCENES = [
  { id:'scene/1',  n:1,  title:'Hospital, 4am',            beatId:'beat/1',  characters:['char/mara'],                location:'St. Jerome ER',    status:'draft',    wordCount: 1120, flags:[] },
  { id:'scene/3',  n:3,  title:'Apartment, empty',         beatId:'beat/2',  characters:['char/mara'],                location:'10B · Hallway',    status:'draft',    wordCount: 870,  flags:['redundant'] },
  { id:'scene/9',  n:9,  title:'Park enters 10B',          beatId:'beat/6',  characters:['char/mara','char/park'],    location:'10B · Hallway',    status:'draft',    wordCount: 1450, flags:['continuity'] },
  { id:'scene/14', n:14, title:'Hallway confrontation',    beatId:'beat/6',  characters:['char/mara','char/ivor'],    location:'10th floor',       status:'revising', wordCount: 980,  flags:['voice-flat','on-nose'] },
  { id:'scene/22', n:22, title:'10A, Mara enters',         beatId:'beat/7',  characters:['char/mara'],                location:'10A · Hallway',    status:'draft',    wordCount: 620,  flags:['continuity'] },
];

const BEATS = [
  { id:'beat/1',  n:1,  act:1, t:'Opening Image',   v:'Mara clocks out of a night shift. Hospital corridor. Alone.',      earned:true,  flag:'ok' },
  { id:'beat/2',  n:2,  act:1, t:'Inciting',        v:"Letter from her dead sister's landlord. Rent is paid.",           earned:true,  flag:'ok' },
  { id:'beat/3',  n:3,  act:1, t:'Debate',          v:'Does she call the police, or go herself?',                         earned:true,  flag:'ok' },
  { id:'beat/4',  n:4,  act:1, t:'Break into II',   v:'She pockets the spare key. Crosses the city.',                     earned:true,  flag:'ok' },
  { id:'beat/5',  n:5,  act:2, t:'Fun & Games',     v:"She lives in the apartment. Studies the tenant's routine.",       earned:true,  flag:'ok' },
  { id:'beat/6',  n:6,  act:2, t:'B-Story',         v:'Detective Park circles her, misreads her grief as guilt.',         earned:true,  flag:'ok' },
  { id:'beat/7',  n:7,  act:2, t:'Midpoint',        v:'',                                                                  earned:false, flag:'stuck' },
  { id:'beat/8',  n:8,  act:2, t:'Bad Guys Close',  v:'',                                                                  earned:false, flag:'empty' },
  { id:'beat/9',  n:9,  act:2, t:'All Is Lost',     v:'',                                                                  earned:false, flag:'empty' },
  { id:'beat/10', n:10, act:3, t:'Break into III',  v:'',                                                                  earned:false, flag:'empty' },
  { id:'beat/11', n:11, act:3, t:'Finale',          v:'',                                                                  earned:false, flag:'empty' },
  { id:'beat/12', n:12, act:3, t:'Final Image',     v:'',                                                                  earned:false, flag:'empty' },
];

const CHARACTERS = [
  { id:'char/mara',  name:'Mara Aldine',  role:'protagonist', depth:82,
    triad:{ wound:"Left her sister's call unanswered the night she died.", want:"Proof she isn't complicit.", need:'To grieve instead of investigate.' },
    arc:['beat/1','beat/5','beat/7','beat/11'],
    voice:{ angry:'"I don\'t need your condolences. I need the key."', afraid:'"…the light under the door moved. It moved, Elena."', loving:'"You don\'t have to say it back. Just — stay on the line."' } },
  { id:'char/ivor',  name:'Ivor Kade',    role:'antagonist',  depth:48,
    triad:{ wound:'[unknown]', want:'[functions as suspicion device]', need:'[not yet earned]' },
    arc:[], voice:{ angry:'', afraid:'', loving:'' } },
  { id:'char/elena', name:'Elena Soler',  role:'supporting',  depth:64, triad:{wound:'',want:'',need:''}, arc:[], voice:{angry:'',afraid:'',loving:''} },
  { id:'char/park',  name:'Det. Park',    role:'supporting',  depth:22, triad:{wound:'',want:'',need:''}, arc:[], voice:{angry:'',afraid:'',loving:''} },
];

const WORLD_RULES = [
  { id:'rule/elevator', rule:'The elevator only services floors 1–9. The 10th floor uses a stairwell key.', cited:4, scenes:['scene/3','scene/9','scene/14','scene/22'], conflict:null },
  { id:'rule/mail',     rule:'Mail is delivered at 7am. Residents are asleep.',                              cited:2, scenes:['scene/3','scene/9'], conflict:null },
  { id:'rule/cctv',     rule:'The building has no CCTV on residential floors. Lobby only.',                  cited:3, scenes:['scene/9','scene/14','scene/22'], conflict:null },
  { id:'rule/keys',     rule:"Mara's apartment key opens 10B but not 10A.",                                  cited:1, scenes:['scene/3'], conflict:{ sceneId:'scene/22', note:'Scene 22 has her entering 10A with the same key.' } },
  { id:'rule/warrant',  rule:'Detective Park needs a warrant to enter any unit.',                            cited:2, scenes:['scene/3','scene/9'], conflict:{ sceneId:'scene/9', note:'Scene 9 shows him in 10B without one.' } },
];

window.WOS.MOCK_STATE = {
  schemaVersion: '0.3.0',
  project: PROJECT,
  agents: AGENTS,
  tasks: TASKS,
  memory: MEMORY,
  handoffs: HANDOFFS,
  scenes: SCENES,
  beats: BEATS,
  characters: CHARACTERS,
  worldRules: WORLD_RULES,
  lastSyncedAt: now(),
  connection: 'connected',
};
