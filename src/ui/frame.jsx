import React from 'react';
import { store } from '../lib/store.js';
import { eventBus } from '../lib/eventBus.js';

export function useStore(selector) {
  const [val, setVal] = React.useState(() => selector(store.get()));
  React.useEffect(() => {
    const tick = () => setVal(selector(store.get()));
    tick();
    return store.subscribe(tick);
  }, []);
  return val;
}

const NAV = [
  { group: 'MISSION',
    items: [
      { id: 'control',   label: 'Mission Control',  icon: 'grid',     shortcut: '⌘1' },
      { id: 'triage',    label: 'Triage',            icon: 'signal',   shortcut: '⌘2' },
      { id: 'tasks',     label: 'Task queue',        icon: 'queue',    shortcut: '⌘3', badge: 'openTasks' },
      { id: 'handoffs',  label: 'Handoff timeline',  icon: 'timeline', shortcut: '⌘4' },
    ] },
  { group: 'KNOWLEDGE',
    items: [
      { id: 'memory',    label: 'Hive mind',         icon: 'brain',    shortcut: '⌘5' },
      { id: 'structure', label: 'Story structure',   icon: 'structure' },
      { id: 'cast',      label: 'Cast dossier',      icon: 'cast' },
      { id: 'world',     label: 'World canon',       icon: 'canon' },
      { id: 'scenes',    label: 'Scene workspace',   icon: 'scene' },
    ] },
  { group: 'SPECIALISTS',
    items: [
      { id: 'agent:sam',    label: 'Sam',    icon: 'dot', agentId: 'sam' },
      { id: 'agent:casey',  label: 'Casey',  icon: 'dot', agentId: 'casey' },
      { id: 'agent:oliver', label: 'Oliver', icon: 'dot', agentId: 'oliver' },
      { id: 'agent:maya',   label: 'Maya',   icon: 'dot', agentId: 'maya' },
      { id: 'agent:zoe',    label: 'Zoe',    icon: 'dot', agentId: 'zoe' },
      { id: 'agent:marcus', label: 'Marcus', icon: 'dot', agentId: 'marcus' },
    ] },
  { group: 'SYSTEM',
    items: [
      { id: 'inspector', label: 'State inspector', icon: 'code' },
      { id: 'modules',   label: 'Future modules',  icon: 'modules' },
      { id: 'settings',  label: 'Settings',        icon: 'settings' },
    ] },
];

export function Icon({ name, size = 14 }) {
  const p = {
    grid:      'M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z',
    signal:    'M2 12h2v2H2zm4-4h2v6H6zm4-4h2v10h-2zm4-4h2v14h-2z',
    queue:     'M2 3h12M2 8h12M2 13h12',
    timeline:  'M2 8h12M4 5v6M8 3v10M12 5v6',
    brain:     'M5 4c-2 0-3 1-3 3s1 3 1 4-1 1-1 2 1 2 2 2c1 1 3 1 3 0v-9c0-1-1-2-2-2zm6 0c2 0 3 1 3 3s-1 3-1 4 1 1 1 2-1 2-2 2c-1 1-3 1-3 0v-9c0-1 1-2 2-2z',
    structure: 'M2 3h12M2 8h8M2 13h12',
    cast:      'M8 7a2 2 0 100-4 2 2 0 000 4zm-4 6c0-2 2-3 4-3s4 1 4 3',
    canon:     'M3 2h8l2 2v10H3zM3 2v12M6 5h5M6 8h5M6 11h3',
    scene:     'M2 3h12v10H2zM5 3v10M11 3v10',
    dot:       '',
    code:      'M5 5L2 8l3 3m6-6l3 3-3 3',
    modules:   'M2 2h5v5H2zm7 7h5v5H9zM9 2l5 5M2 9l5 5',
    settings:  'M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM13 8a5 5 0 00-.2-1.3l1-.8-1-1.7-1.2.5a5 5 0 00-2.3-1.3L9 2H7l-.3 1.4a5 5 0 00-2.3 1.3L3.2 4.2l-1 1.7 1 .8A5 5 0 003 8a5 5 0 00.2 1.3l-1 .8 1 1.7 1.2-.5a5 5 0 002.3 1.3L7 14h2l.3-1.4a5 5 0 002.3-1.3l1.2.5 1-1.7-1-.8c.1-.4.2-.8.2-1.3z',
  }[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={p}/>
    </svg>
  );
}

export function statusColor(s) {
  return { idle: '#9ca3af', thinking: '#b3a4f0', writing: '#e0c889', waiting: '#d97757', offline: '#4b4751' }[s] || '#9ca3af';
}

export function tintForTaskState(s) {
  return { draft: '#6a6470', queued: '#9b8cc9', live: '#4ade80', blocked: '#d97757', review: '#e0c889', completed: 'var(--fg-muted)' }[s] || '#9ca3af';
}

// --- TopBar -------------------------------------------------------------------
export function TopBar({ screen, setScreen, activeAgentId }) {
  const project     = useStore(s => s.project);
  const connection  = useStore(s => s.connection);
  const agents      = useStore(s => s.agents);
  const activeAgent = activeAgentId ? agents.find(a => a.id === activeAgentId) : null;
  const syncedAgo   = useStore(s => {
    const ms = Date.now() - new Date(s.lastSyncedAt).getTime();
    return ms < 60000 ? 'just now' : `${Math.round(ms / 60000)}m ago`;
  });

  return (
    <header style={{
      gridArea: 'top', display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 16px', height: 48,
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 55%, #000))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#0f0b13" strokeWidth="2" strokeLinecap="round">
            <path d="M3 13L13 3M10 3h3v3"/>
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>WriterOS</div>
        <span style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', padding: '1px 6px', borderRadius: 3, background: 'var(--chip)' }}>v0.3</span>
      </div>

      <div style={{ height: 22, width: 1, background: 'var(--border)' }}/>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>project</span>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500 }}>{project.title}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>· {project.wordCount.toLocaleString()} words</span>
      </div>

      {activeAgent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px 3px 4px', borderRadius: 999, background: 'var(--chip)' }}>
          <span style={{ width: 18, height: 18, borderRadius: 9, background: activeAgent.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{activeAgent.letter}</span>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{activeAgent.name}</span>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: statusColor(activeAgent.status), boxShadow: `0 0 5px ${statusColor(activeAgent.status)}` }}/>
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
        <StatusPill label="runtime" value="claude-code" tint="#b3a4f0"/>
        <StatusPill label="sync" value={`${connection} · ${syncedAgo}`} tint={connection === 'connected' ? '#4ade80' : connection === 'syncing' ? '#e0c889' : '#d97757'}/>
        <StatusPill label="agents" value={`${agents.filter(a => a.status !== 'offline').length}/${agents.length} live`} tint="#4ade80"/>
        <button style={topBtn}>⌘K · command</button>
      </div>
    </header>
  );
}

function StatusPill({ label, value, tint }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tint, boxShadow: `0 0 5px ${tint}` }}/>
      <span style={{ textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>{label}</span>
      <span style={{ color: 'var(--fg)' }}>{value}</span>
    </span>
  );
}

const topBtn = {
  padding: '3px 9px', borderRadius: 4, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--fg-muted)',
  fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
};

// --- LeftNav ------------------------------------------------------------------
export function LeftNav({ screen, setScreen }) {
  const agents    = useStore(s => s.agents);
  const openTasks = useStore(s => s.tasks.filter(t => !['completed', 'archived'].includes(t.state)).length);

  return (
    <nav style={{
      gridArea: 'nav', overflowY: 'auto',
      background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
      padding: '10px 0 14px',
    }}>
      {NAV.map(g => (
        <div key={g.group} style={{ padding: '6px 10px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.5, padding: '6px 6px 4px' }}>{g.group}</div>
          {g.items.map(item => {
            const active = screen === item.id;
            const agent  = item.agentId && agents.find(a => a.id === item.agentId);
            return (
              <button key={item.id} onClick={() => setScreen(item.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '6px 8px', borderRadius: 5, border: 'none',
                background: active ? 'var(--row-active)' : 'transparent',
                color: active ? 'var(--fg)' : 'var(--fg-muted)',
                fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer',
                textAlign: 'left', position: 'relative',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in oklch, var(--row-active) 50%, transparent)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                {active && <span style={{ position: 'absolute', left: -10, top: 6, bottom: 6, width: 2, background: agent ? agent.accent : 'var(--primary)', borderRadius: 2 }}/>}
                {agent
                  ? <span style={{ width: 14, height: 14, borderRadius: 7, background: agent.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{agent.letter}</span>
                  : <Icon name={item.icon}/>}
                <span style={{ flex: 1 }}>{item.label}</span>
                {agent && <span style={{ width: 5, height: 5, borderRadius: 3, background: statusColor(agent.status) }}/>}
                {item.badge === 'openTasks' && openTasks > 0 && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'var(--primary)', color: '#15120e', fontWeight: 600 }}>{openTasks}</span>
                )}
                {item.shortcut && !agent && !item.badge && (
                  <span style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', opacity: 0.6 }}>{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// --- RightDrawer -------------------------------------------------------------
export function RightDrawer({ screen, activeAgentId }) {
  const [tab, setTab] = React.useState('context');
  const memory      = useStore(s => s.memory);
  const tasks       = useStore(s => s.tasks);
  const agents      = useStore(s => s.agents);
  const activeAgent = activeAgentId ? agents.find(a => a.id === activeAgentId) : null;

  let contextBlock;
  if (activeAgent) {
    contextBlock = <AgentContextCard agent={activeAgent} tasks={tasks.filter(t => t.assignedTo === activeAgent.id)}/>;
  } else {
    contextBlock = <ProjectContextCard/>;
  }

  return (
    <aside style={{
      gridArea: 'drawer', overflowY: 'auto',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', gap: 2, padding: '10px 10px 0' }}>
        {['context', 'memory', 'events'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 4, border: 'none',
            background: tab === t ? 'var(--row-active)' : 'transparent',
            color: tab === t ? 'var(--fg)' : 'var(--fg-muted)',
            fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>
      <div style={{ padding: 12, flex: 1, overflowY: 'auto' }}>
        {tab === 'context' && contextBlock}
        {tab === 'memory'  && <MemoryStream memory={memory} filter={activeAgent?.id}/>}
        {tab === 'events'  && <EventStream/>}
      </div>
    </aside>
  );
}

function AgentContextCard({ agent, tasks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: 12, borderRadius: 7, background: `color-mix(in oklch, ${agent.accent} 10%, transparent)`, border: `1px solid color-mix(in oklch, ${agent.accent} 28%, transparent)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 13, background: agent.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{agent.letter}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{agent.name}</div>
            <div style={{ fontSize: 10.5, color: agent.accent, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>{agent.role}</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}><span style={{ color: 'var(--fg)' }}>{agent.focus}</span></div>
      </div>
      <Section title="Reads" items={agent.reads}/>
      <Section title="Writes" items={agent.writes}/>
      <Section title="Capabilities" items={agent.capabilities}/>
      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Active tasks · {tasks.length}</div>
        {tasks.map(t => (
          <div key={t.id} style={{ padding: '7px 9px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 5, fontSize: 11.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: tintForTaskState(t.state), textTransform: 'uppercase', letterSpacing: 1 }}>{t.state}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{t.id}</span>
            </div>
            <div>{t.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectContextCard() {
  const project = useStore(s => s.project);
  const agents  = useStore(s => s.agents);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Project</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500, lineHeight: 1.25 }}>{project.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4, lineHeight: 1.5, fontStyle: 'italic' }}>{project.logline}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Agents · {agents.length}</div>
        {agents.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, background: a.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{a.letter}</span>
            <span style={{ flex: 1 }}>{a.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: statusColor(a.status) }}>{a.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, items }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map((x, i) => (
          <span key={i} style={{ fontSize: 10.5, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 3, background: 'var(--chip)', color: 'var(--fg-muted)' }}>{x}</span>
        ))}
      </div>
    </div>
  );
}

function MemoryStream({ memory, filter }) {
  const visible = filter ? memory.filter(m => m.source === filter || m.witnesses.includes(filter) || m.witnesses.includes('*')) : memory;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {visible.slice(-12).reverse().map(m => <MemoryItem key={m.id} m={m}/>)}
    </div>
  );
}

function MemoryItem({ m }) {
  const klass = { canon: 'var(--primary)', pinned: 'var(--p-sam)', inferred: 'var(--p-casey)', general: 'var(--fg-muted)', decaying: '#6a6470' }[m.class];
  return (
    <div style={{ padding: '8px 10px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', opacity: 1 - m.decay * 0.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: klass, textTransform: 'uppercase', letterSpacing: 1 }}>{m.class}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{m.id} · {Math.round(m.confidence * 100)}%</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--fg)' }}>{m.text}</div>
      <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', marginTop: 4 }}>src:{m.source} · refs:{m.refs.join(',') || '—'}</div>
    </div>
  );
}

function EventStream() {
  const [events, setEvents] = React.useState([]);
  React.useEffect(() => {
    return eventBus.on('*', ({ event, payload }) => {
      setEvents(evs => [{ t: new Date(), event, payload }, ...evs].slice(0, 40));
    });
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Bus · tail -f</div>
      {events.length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>No events yet. Create a task or trigger a handoff.</div>}
      {events.map((e, i) => (
        <div key={i} style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 10.5 }}>
          <span style={{ color: 'var(--primary)' }}>{e.event}</span>
          <span style={{ color: 'var(--fg-muted)', float: 'right' }}>{e.t.toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
