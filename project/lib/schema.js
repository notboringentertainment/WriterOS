// =============================================================================
//  WriterOS  ·  Backend Contract
// -----------------------------------------------------------------------------
//  This file is the single source of truth for the shape of every entity the
//  UI consumes.  The frontend never constructs these shapes ad-hoc — it asks
//  `store.js` for typed selectors.  `bridge.js` is the ONLY place that knows
//  whether the data came from a local mock, a REST endpoint, or a websocket
//  push from a Claude Code orchestration service.
//
//  When wiring to a real backend:
//    • Keep these shapes stable. Version them via `schemaVersion`.
//    • Replace the mock producers in `state.mock.js` with real fetchers.
//    • Stream deltas into `eventBus.emit(...)`; the UI is already listening.
// =============================================================================

export const SCHEMA_VERSION = '0.3.0';

/**
 * @typedef {Object} Agent
 * @property {string}   id          Stable handle — 'sam', 'casey', ...
 * @property {string}   name
 * @property {string}   role        Short role label
 * @property {string}   accent      CSS color token
 * @property {string}   letter      Avatar glyph
 * @property {'idle'|'thinking'|'writing'|'waiting'|'offline'} status
 * @property {string}   focus       One-line "what they're on right now"
 * @property {string[]} capabilities  What this agent is allowed to do
 * @property {string[]} reads        Schema keys this agent pulls context from
 * @property {string[]} writes       Schema keys this agent can mutate
 */

/**
 * @typedef {Object} Task
 * @property {string}   id
 * @property {'draft'|'queued'|'live'|'blocked'|'review'|'completed'|'archived'} state
 * @property {string}   title
 * @property {string}   detail
 * @property {string|null} assignedTo   agent.id — null means triage inbox
 * @property {string|null} requestedBy  agent.id | 'user'
 * @property {string[]} tags
 * @property {string[]} blockers     task.id[]
 * @property {string}   createdAt    ISO
 * @property {string|null} dueAt
 * @property {string[]} refs         schema refs like 'scene/14', 'char/mara'
 * @property {number}   priority     0..3
 */

/**
 * @typedef {Object} MemoryEntry
 * @property {string}   id
 * @property {'canon'|'pinned'|'inferred'|'general'|'decaying'} class
 * @property {string}   text
 * @property {string}   source         agent.id or 'user'
 * @property {string[]} witnesses      agent.id[] — who has read this
 * @property {string[]} refs
 * @property {number}   confidence     0..1
 * @property {string}   createdAt
 * @property {number}   decay          0..1 ; 1 = fully forgotten
 */

/**
 * @typedef {Object} HandoffEvent
 * @property {string}   id
 * @property {string}   from           agent.id | 'user'
 * @property {string}   to             agent.id
 * @property {string}   summary
 * @property {string[]} artifacts      ref strings
 * @property {string}   createdAt
 * @property {'pending'|'accepted'|'completed'} state
 */

/**
 * @typedef {Object} Scene
 * @property {string}   id            'scene/14'
 * @property {number}   n
 * @property {string}   title
 * @property {string|null} beatId
 * @property {string[]} characters    char.id[]
 * @property {string}   location
 * @property {'draft'|'revising'|'locked'} status
 * @property {number}   wordCount
 * @property {string[]} flags         'voice-flat' | 'continuity' | ...
 */

/**
 * @typedef {Object} Beat
 * @property {string}  id            'beat/midpoint'
 * @property {number}  n
 * @property {1|2|3}   act
 * @property {string}  t             title
 * @property {string}  v             content
 * @property {boolean} earned
 * @property {'ok'|'stuck'|'empty'} flag
 */

/**
 * @typedef {Object} Character
 * @property {string}  id            'char/mara'
 * @property {string}  name
 * @property {'protagonist'|'antagonist'|'supporting'} role
 * @property {number}  depth         0..100 completeness %
 * @property {{wound:string, want:string, need:string}} triad
 * @property {string[]} arc          beat IDs of major turns
 * @property {{angry:string, afraid:string, loving:string}} voice
 */

/**
 * @typedef {Object} WorldRule
 * @property {string}  id
 * @property {string}  rule
 * @property {number}  cited
 * @property {string[]} scenes
 * @property {{sceneId:string, note:string}|null} conflict
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} title
 * @property {string} logline
 * @property {string} genre
 * @property {number} wordCount
 * @property {string} status          one-liner health string
 * @property {string} author
 */

/**
 * @typedef {Object} ProjectState     ← the canonical blob every agent reads from
 * @property {string}         schemaVersion
 * @property {Project}        project
 * @property {Agent[]}        agents
 * @property {Task[]}         tasks
 * @property {MemoryEntry[]}  memory
 * @property {HandoffEvent[]} handoffs
 * @property {Scene[]}        scenes
 * @property {Beat[]}         beats
 * @property {Character[]}    characters
 * @property {WorldRule[]}    worldRules
 * @property {string}         lastSyncedAt
 * @property {'connected'|'syncing'|'offline'|'degraded'} connection
 */

// Event names the UI and backend agree on — kept as constants so they can be
// search-replaced when contracts change.
export const EVENTS = Object.freeze({
  // ↓ outbound (UI → backend)
  TASK_CREATE:        'task.create',
  TASK_ASSIGN:        'task.assign',
  TASK_TRANSITION:    'task.transition',
  HANDOFF_REQUEST:    'handoff.request',
  MEMORY_PIN:         'memory.pin',
  AGENT_INVOKE:       'agent.invoke',
  // ↑ inbound (backend → UI — streamed via ws in prod, emitted by mock in dev)
  STATE_PATCH:        'state.patch',       // { path, value }
  STATE_REPLACE:      'state.replace',     // full snapshot
  AGENT_STATUS:       'agent.status',      // { id, status, focus }
  TASK_UPDATED:       'task.updated',
  HANDOFF_COMPLETED:  'handoff.completed',
  MEMORY_APPENDED:    'memory.appended',
  NOTIFICATION:       'notification',
});

// Classes for memory — used by the Hive Mind browser facets.
export const MEMORY_CLASSES = [
  { id: 'canon',    label: 'Project canon',  tint: 'var(--primary)'  },
  { id: 'pinned',   label: 'Pinned truths',  tint: 'var(--p-sam)'    },
  { id: 'inferred', label: 'Inferred',       tint: 'var(--p-casey)'  },
  { id: 'general',  label: 'General',        tint: 'var(--fg-muted)' },
  { id: 'decaying', label: 'Decaying',       tint: '#6a6470'         },
];

export const TASK_STATES = [
  { id: 'draft',     label: 'Draft',     tint: '#6a6470' },
  { id: 'queued',    label: 'Queued',    tint: '#9b8cc9' },
  { id: 'live',      label: 'Live',      tint: '#4ade80' },
  { id: 'blocked',   label: 'Blocked',   tint: '#d97757' },
  { id: 'review',    label: 'Review',    tint: '#e0c889' },
  { id: 'completed', label: 'Completed', tint: 'var(--fg-muted)' },
];
