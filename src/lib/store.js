import { eventBus } from './eventBus.js';
import { bridge } from './bridge.js';
import { MOCK_STATE } from './state.mock.js';

let state = { ...MOCK_STATE };
const subs = new Set();
const notify = () => subs.forEach(fn => fn(state));

function applyPatch(path, value) {
  const keys = path.split('.');
  const next = { ...state };
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  state = next;
  notify();
}

export const sel = {
  all:           ()    => state,
  project:       ()    => state.project,
  agents:        ()    => state.agents,
  agent:         (id)  => state.agents.find(a => a.id === id),
  tasks:         ()    => state.tasks,
  tasksByAgent:  (id)  => state.tasks.filter(t => t.assignedTo === id),
  tasksByState:  (s)   => state.tasks.filter(t => t.state === s),
  openTaskCount: ()    => state.tasks.filter(t => !['completed', 'archived'].includes(t.state)).length,
  memory:        ()    => state.memory,
  handoffs:      ()    => state.handoffs,
  recentHandoffs:(n=6) => state.handoffs.slice(-n).reverse(),
  scenes:        ()    => state.scenes,
  beats:         ()    => state.beats,
  characters:    ()    => state.characters,
  worldRules:    ()    => state.worldRules,
  worldConflicts:()    => state.worldRules.filter(r => r.conflict),
  connection:    ()    => state.connection,
  unseenMemoryFor: (id) => state.memory.filter(m => !(m.witnesses.includes('*') || m.witnesses.includes(id)) && m.source !== id),
  blockingEdges: () => {
    const edges = [];
    state.tasks.forEach(t => (t.blockers || []).forEach(b => {
      const src = state.tasks.find(x => x.id === b);
      if (src && src.assignedTo && t.assignedTo) edges.push({ from: src.assignedTo, to: t.assignedTo, via: t.id });
    }));
    return edges;
  },
};

export const actions = {
  async createTask(partial) {
    const task = {
      id: 't-' + Math.random().toString(36).slice(2, 7),
      state: 'draft', assignedTo: null, requestedBy: 'user',
      tags: [], blockers: [], createdAt: new Date().toISOString(),
      dueAt: null, refs: [], priority: 1, detail: '',
      ...partial,
    };
    applyPatch('tasks', [...state.tasks, task]);
    await bridge.createTask(task);
    return task;
  },
  async assignTask(taskId, agentId) {
    const tasks = state.tasks.map(t => t.id === taskId ? { ...t, assignedTo: agentId, state: t.state === 'draft' ? 'queued' : t.state } : t);
    applyPatch('tasks', tasks);
    await bridge.assignTask(taskId, agentId);
  },
  async transitionTask(taskId, to) {
    const tasks = state.tasks.map(t => t.id === taskId ? { ...t, state: to } : t);
    applyPatch('tasks', tasks);
    await bridge.transitionTask(taskId, to);
  },
  async handoff(from, to, summary, artifacts = []) {
    const h = { id: 'h-' + Math.random().toString(36).slice(2, 6), from, to, summary, artifacts, createdAt: new Date().toISOString(), state: 'pending' };
    applyPatch('handoffs', [...state.handoffs, h]);
    await bridge.requestHandoff(from, to, summary, artifacts);
  },
  async pinMemory(entry) {
    const m = { id: 'm-' + Math.random().toString(36).slice(2, 6), class: 'pinned', witnesses: ['*'], refs: [], confidence: 1, decay: 0, createdAt: new Date().toISOString(), source: 'user', ...entry };
    applyPatch('memory', [...state.memory, m]);
    await bridge.pinMemory(m);
  },
};

eventBus.on('state.patch',   ({ path, value }) => applyPatch(path, value));
eventBus.on('state.replace', (snap) => { state = snap; notify(); });
eventBus.on('agent.status',  ({ id, status, focus }) => {
  const agents = state.agents.map(a => a.id === id ? { ...a, status, focus: focus ?? a.focus } : a);
  applyPatch('agents', agents);
});

export const store = {
  get: () => state,
  subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  sel,
  actions,
};
