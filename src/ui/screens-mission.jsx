import React from 'react';
import { useStore, statusColor, tintForTaskState } from './frame.jsx';
import { store } from '../lib/store.js';
import { Screen, Panel, Stat, Chip, Empty, primaryBtn, ghostBtn, Dot, Arrow } from './primitives.jsx';

export function MissionControl({ setScreen }) {
  const project   = useStore(s => s.project);
  const agents    = useStore(s => s.agents);
  const tasks     = useStore(s => s.tasks);
  const handoffs  = useStore(s => s.handoffs);
  const beats     = useStore(s => s.beats);
  const conflicts = useStore(s => s.worldRules.filter(r => r.conflict));
  const connection = useStore(s => s.connection);

  const liveTasks   = tasks.filter(t => t.state === 'live');
  const blocked     = tasks.filter(t => t.state === 'blocked');
  const earnedBeats = beats.filter(b => b.earned).length;

  return (
    <Screen title="Mission Control" subtitle="System-wide view · all agents, one manuscript">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>

        <Panel span={8} title="Project health" kicker="aggregated across all agents">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 500, margin: '0 0 6px', lineHeight: 1.15, letterSpacing: -0.4 }}>{project.title}</h2>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5, fontStyle: 'italic', maxWidth: 600 }}>{project.logline}</p>
              <div style={{ display: 'flex', gap: 18, marginTop: 14, fontFamily: 'var(--mono)', fontSize: 11 }}>
                <Stat label="words"     value={project.wordCount.toLocaleString()}/>
                <Stat label="beats"     value={`${earnedBeats}/12`}    tint={earnedBeats < 7 ? '#e0c889' : '#4ade80'}/>
                <Stat label="tasks"     value={`${liveTasks.length} live · ${blocked.length} blocked`} tint={blocked.length ? '#d97757' : 'var(--fg)'}/>
                <Stat label="conflicts" value={`${conflicts.length} unresolved`} tint={conflicts.length ? '#d97757' : '#4ade80'}/>
                <Stat label="sync"      value={connection} tint={connection === 'connected' ? '#4ade80' : '#e0c889'}/>
              </div>
            </div>
            <HealthDial beats={beats}/>
          </div>
        </Panel>

        <Panel span={4} title="Triage says" kicker="recommended next move">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--primary)', color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>T</span>
            <div style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>Coordinator</div>
          </div>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.45, margin: 0 }}>
            Casey should lock Mara's wound before Oliver retries the midpoint. Marcus's note #2 is upstream of both.
          </p>
          <button onClick={() => setScreen('triage')} style={primaryBtn}>Open triage room →</button>
        </Panel>

        <Panel span={8} title="Agents" kicker="live focus & status">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {agents.map(a => (
              <div key={a.id} onClick={() => setScreen('agent:' + a.id)} style={{
                padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                background: 'var(--bg)', border: '1px solid var(--border)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `color-mix(in oklch, ${a.accent} 50%, transparent)`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, background: a.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{a.letter}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{a.role}</div>
                  </div>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: statusColor(a.status), textTransform: 'uppercase', letterSpacing: 1 }}>{a.status}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45, minHeight: 32 }}>{a.focus}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel span={4} title="Flags" kicker={`${conflicts.length + blocked.length} need attention`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blocked.map(t => <FlagRow key={t.id} tint="#d97757" label="BLOCKED" title={t.title} meta={`→ ${t.assignedTo || '—'}`}/>)}
            {conflicts.map(r => <FlagRow key={r.id} tint="#d97757" label="CANON" title={r.rule} meta={r.conflict?.note}/>)}
            {(blocked.length + conflicts.length === 0) && <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontStyle: 'italic' }}>No flags. Clean board.</div>}
          </div>
        </Panel>

        <Panel span={12} title="Handoff river" kicker="last six hand-offs · click to replay">
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {handoffs.slice(-6).reverse().map(h => <HandoffCard key={h.id} h={h} agents={agents}/>)}
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function HealthDial({ beats }) {
  const earned = beats.filter(b => b.earned).length;
  const pct = earned / beats.length;
  const circ = 2 * Math.PI * 36;
  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="36" fill="none" stroke="var(--border)" strokeWidth="4"/>
        <circle cx="48" cy="48" r="36" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 48 48)"/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>{Math.round(pct * 100)}%</div>
        <div style={{ fontSize: 9, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>structure</div>
      </div>
    </div>
  );
}

function FlagRow({ tint, label, title, meta }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 5, background: `color-mix(in oklch, ${tint} 8%, var(--bg))`, border: `1px solid color-mix(in oklch, ${tint} 35%, transparent)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: tint, letterSpacing: 1 }}>{label}</span>
        {meta && <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{meta}</span>}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4 }}>{title}</div>
    </div>
  );
}

function HandoffCard({ h, agents }) {
  const from = h.from === 'user' ? { name: 'User', accent: 'var(--primary)', letter: 'U' } : agents.find(a => a.id === h.from);
  const to   = agents.find(a => a.id === h.to);
  return (
    <div style={{ minWidth: 260, flexShrink: 0, padding: '10px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Dot a={from}/> <Arrow/> <Dot a={to}/>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: h.state === 'completed' ? '#4ade80' : h.state === 'accepted' ? '#e0c889' : 'var(--fg-muted)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: 1 }}>{h.state}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--fg)' }}>{h.summary}</div>
      {h.artifacts.length > 0 && (
        <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--fg-muted)', marginTop: 6 }}>
          {h.artifacts.map(a => <span key={a} style={{ marginRight: 6 }}>· {a}</span>)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  Triage
// ============================================================================

export function TriageView({ setScreen }) {
  const agents  = useStore(s => s.agents);
  const tasks   = useStore(s => s.tasks);
  const inbox   = tasks.filter(t => t.assignedTo === null);
  const blocking = useStore(() => store.sel.blockingEdges());

  return (
    <Screen title="Triage" subtitle="Coordinator · routes incoming work, resolves blockers">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Panel title="Unassigned inbox" kicker={`${inbox.length} awaiting routing`}>
          {inbox.length === 0 && <Empty>Inbox clear. Triage is idle.</Empty>}
          {inbox.map(t => (
            <div key={t.id} style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{t.id}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: tintForTaskState(t.state), letterSpacing: 1, textTransform: 'uppercase' }}>{t.state}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-muted)' }}>from {t.requestedBy}</span>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{t.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>{t.detail}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--fg-muted)' }}>route →</span>
                {agents.filter(a => a.id !== 'triage').map(a => (
                  <button key={a.id} onClick={() => store.actions.assignTask(t.id, a.id)} style={routeBtn(a.accent)}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: a.accent, display: 'inline-block' }}/> {a.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Dependency graph" kicker="who is blocking whom">
          <DepGraph agents={agents.filter(a => a.id !== 'triage')} edges={blocking}/>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 10, lineHeight: 1.5 }}>
            Oliver can't earn beat 7 until Casey locks Mara's wound. Marcus's note set is upstream of everyone — resolving it collapses three tickets.
          </div>
        </Panel>

        <Panel span={2} title="Delegation log" kicker="ordered event stream from triage">
          <TriageLog/>
        </Panel>
      </div>
    </Screen>
  );
}

function DepGraph({ agents, edges }) {
  const w = 520, h = 240, cx = w / 2, cy = h / 2, r = 90;
  const pos = {};
  agents.forEach((a, i) => {
    const θ = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
    pos[a.id] = { x: cx + r * Math.cos(θ), y: cy + r * Math.sin(θ) };
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 240 }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)"/>
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d97757" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr)" opacity="0.8"/>;
      })}
      {agents.map(a => {
        const p = pos[a.id];
        return (
          <g key={a.id}>
            <circle cx={p.x} cy={p.y} r="18" fill="var(--bg)" stroke={a.accent} strokeWidth="1.5"/>
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={a.accent}>{a.letter}</text>
            <text x={p.x} y={p.y + 34} textAnchor="middle" fontSize="10" fill="var(--fg-muted)" fontFamily="var(--mono)">{a.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TriageLog() {
  const handoffs = useStore(s => s.handoffs);
  const agents   = useStore(s => s.agents);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {handoffs.slice().reverse().map((h, i, arr) => {
        const from = h.from === 'user' ? { name: 'User', accent: 'var(--primary)', letter: 'U' } : agents.find(a => a.id === h.from);
        const to = agents.find(a => a.id === h.to);
        return (
          <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '90px auto 1fr auto', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Dot a={from}/> <Arrow/> <Dot a={to}/>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--fg)' }}>{h.summary}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: h.state === 'completed' ? '#4ade80' : h.state === 'accepted' ? '#e0c889' : 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h.state}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  Task queue
// ============================================================================

const STATE_COLS = ['draft', 'queued', 'live', 'blocked', 'review', 'completed'];

export function TaskQueue() {
  const tasks  = useStore(s => s.tasks);
  const agents = useStore(s => s.agents);
  const [showNew, setShowNew] = React.useState(false);
  const byState = Object.fromEntries(STATE_COLS.map(s => [s, tasks.filter(t => t.state === s)]));

  return (
    <Screen title="Task queue" subtitle="Mission-control kanban · drag later, click for now" actions={<button style={primaryBtn} onClick={() => setShowNew(true)}>+ New task</button>}>
      {showNew && <NewTaskRow agents={agents} onClose={() => setShowNew(false)}/>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATE_COLS.length}, 1fr)`, gap: 10 }}>
        {STATE_COLS.map(s => (
          <div key={s} style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 10, minHeight: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: tintForTaskState(s), textTransform: 'uppercase', letterSpacing: 1.3 }}>{s}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{byState[s].length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byState[s].map(t => <TaskCard key={t.id} t={t} agents={agents}/>)}
              {byState[s].length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic', padding: '10px 2px' }}>—</div>}
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function TaskCard({ t, agents }) {
  const a = t.assignedTo ? agents.find(x => x.id === t.assignedTo) : null;
  return (
    <div style={{ padding: '8px 10px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{t.id}</span>
        {t.priority >= 3 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#d97757', color: '#15120e', fontWeight: 700 }}>P{t.priority}</span>}
        <span style={{ marginLeft: 'auto' }}>{a && <span style={{ width: 16, height: 16, borderRadius: 8, background: a.accent, color: '#15120e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{a.letter}</span>}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4 }}>{t.title}</div>
      {t.refs.length > 0 && <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--fg-muted)', marginTop: 6 }}>{t.refs.slice(0, 3).map(r => '· ' + r).join(' ')}</div>}
      {t.blockers.length > 0 && <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: '#d97757', marginTop: 3 }}>⚑ blocked by {t.blockers.join(', ')}</div>}
    </div>
  );
}

function NewTaskRow({ agents, onClose }) {
  const [title, setTitle]     = React.useState('');
  const [assigned, setAssigned] = React.useState(null);
  const create = () => {
    if (!title.trim()) return;
    store.actions.createTask({ title, assignedTo: assigned, state: assigned ? 'queued' : 'draft' });
    onClose();
  };
  return (
    <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface)', border: '1px dashed color-mix(in oklch, var(--primary) 40%, transparent)', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Describe the task…" style={{ flex: 1, background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit' }}/>
      <select value={assigned || ''} onChange={e => setAssigned(e.target.value || null)} style={{ background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit' }}>
        <option value="">→ Triage</option>
        {agents.filter(a => a.id !== 'triage').map(a => <option key={a.id} value={a.id}>→ {a.name}</option>)}
      </select>
      <button onClick={create} style={primaryBtn}>Create</button>
      <button onClick={onClose} style={ghostBtn}>Cancel</button>
    </div>
  );
}

function routeBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--fg-muted)',
    fontFamily: 'inherit', fontSize: 10.5, cursor: 'pointer',
  };
}

// ============================================================================
//  Handoff timeline
// ============================================================================

export function HandoffTimeline() {
  const handoffs = useStore(s => s.handoffs);
  const agents   = useStore(s => s.agents);
  return (
    <Screen title="Handoff timeline" subtitle="Every cross-agent pass · audit log · source of truth for who did what">
      <Panel>
        <div style={{ position: 'relative', paddingLeft: 28 }}>
          <div style={{ position: 'absolute', left: 12, top: 8, bottom: 8, width: 1.5, background: 'var(--border)' }}/>
          {handoffs.slice().reverse().map(h => {
            const from = h.from === 'user' ? { name: 'User', accent: 'var(--primary)', letter: 'U' } : agents.find(a => a.id === h.from);
            const to = agents.find(a => a.id === h.to);
            return (
              <div key={h.id} style={{ position: 'relative', padding: '10px 0 16px' }}>
                <div style={{ position: 'absolute', left: -20, top: 12, width: 10, height: 10, borderRadius: 5, background: to.accent, border: '2px solid var(--bg)', boxShadow: `0 0 0 1px ${to.accent}` }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Dot a={from}/> <Arrow/> <Dot a={to}/>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', marginLeft: 6 }}>{h.id} · {new Date(h.createdAt).toLocaleString()}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: h.state === 'completed' ? '#4ade80' : h.state === 'accepted' ? '#e0c889' : 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h.state}</span>
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.45, marginBottom: 6 }}>{h.summary}</div>
                {h.artifacts.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {h.artifacts.map(ref => <Chip key={ref}>{ref}</Chip>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </Screen>
  );
}
