import React from 'react';
import { useStore, tintForTaskState } from './frame.jsx';
import { Screen, Panel, Chip, Empty, primaryBtn } from './primitives.jsx';

// ============================================================================
//  Hive mind
// ============================================================================

export function HiveMind() {
  const memory = useStore(s => s.memory);
  const agents = useStore(s => s.agents);
  const [filter, setFilter] = React.useState('all');
  const classes = ['all', 'canon', 'pinned', 'inferred', 'general', 'decaying'];
  const visible = filter === 'all' ? memory : memory.filter(m => m.class === filter);

  return (
    <Screen title="Hive mind" subtitle="Shared memory across all agents · confidence-weighted, class-tagged">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>
        <Panel title="Entries" kicker={`${visible.length} of ${memory.length} shown`}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
            {classes.map(c => (
              <button key={c} onClick={() => setFilter(c)} style={{
                padding: '3px 9px', borderRadius: 4, border: '1px solid var(--border)',
                background: filter === c ? 'var(--primary)' : 'transparent',
                color: filter === c ? '#15120e' : 'var(--fg-muted)',
                fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontWeight: filter === c ? 700 : 400,
              }}>{c}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {visible.map(m => <MemoryFullCard key={m.id} m={m} agents={agents}/>)}
          </div>
        </Panel>

        <Panel title="Witness matrix" kicker="who has seen what">
          <WitnessMatrix memory={memory} agents={agents.filter(a => a.id !== 'triage')}/>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Rows are agents. Columns are memory entries. Filled cells mean the agent has read or authored that memory. Empty cells mean it will be silently injected on their next invocation.
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function MemoryFullCard({ m, agents }) {
  const klass = { canon: 'var(--primary)', pinned: 'var(--p-sam)', inferred: 'var(--p-casey)', general: 'var(--fg-muted)', decaying: '#6a6470' }[m.class];
  const src = agents.find(a => a.id === m.source);
  return (
    <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg)', border: `1px solid ${m.class === 'canon' ? `color-mix(in oklch, ${klass} 40%, transparent)` : 'var(--border)'}`, opacity: 1 - m.decay * 0.4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: klass, textTransform: 'uppercase', letterSpacing: 1.2 }}>{m.class}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{m.id}</span>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{Math.round(m.confidence * 100)}%</div>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{m.text}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>
        {src && <span style={{ width: 12, height: 12, borderRadius: 6, background: src.accent, color: '#15120e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>{src.letter}</span>}
        <span>src:{m.source}</span>
        <span style={{ marginLeft: 'auto' }}>refs: {m.refs.join(', ') || '—'}</span>
      </div>
    </div>
  );
}

function WitnessMatrix({ memory, agents }) {
  const entries = memory.slice(-12);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ fontFamily: 'var(--mono)', fontSize: 9.5, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th/>
            {entries.map(m => <th key={m.id} style={{ padding: '2px 3px', color: 'var(--fg-muted)', textAlign: 'center', fontWeight: 400 }}>{m.id.slice(-3)}</th>)}
          </tr>
        </thead>
        <tbody>
          {agents.map(a => (
            <tr key={a.id}>
              <td style={{ padding: '3px 6px 3px 0', color: a.accent }}>{a.letter}</td>
              {entries.map(m => {
                const seen   = m.witnesses.includes('*') || m.witnesses.includes(a.id) || m.source === a.id;
                const origin = m.source === a.id;
                return (
                  <td key={m.id} style={{ padding: 2, textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: origin ? a.accent : seen ? `color-mix(in oklch, ${a.accent} 35%, transparent)` : 'var(--chip)' }}/>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
//  Story structure
// ============================================================================

export function StructureView() {
  const beats  = useStore(s => s.beats);
  const agents = useStore(s => s.agents);
  const oliver = agents.find(a => a.id === 'oliver');

  return (
    <Screen title="Story structure" subtitle="Beat board · shared source of truth · Oliver's write scope">
      <Panel title="Save the Cat · 12 beats" kicker={`${beats.filter(b => b.earned).length}/12 earned`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8, marginBottom: 14, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--fg-muted)' }}>
          <div style={{ textAlign: 'center', padding: '5px 0', background: 'var(--chip)', borderRadius: 4 }}>ACT I · 25%</div>
          <div style={{ textAlign: 'center', padding: '5px 0', background: `color-mix(in oklch, ${oliver.accent} 18%, transparent)`, color: oliver.accent, borderRadius: 4 }}>ACT II · 50%</div>
          <div style={{ textAlign: 'center', padding: '5px 0', background: 'var(--chip)', borderRadius: 4 }}>ACT III · 25%</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {beats.map((b, i) => (
            <div key={b.id} style={{
              padding: '11px 12px', borderRadius: 6,
              background: b.flag === 'stuck' ? 'color-mix(in oklch, #d97757 12%, var(--surface))' : 'var(--surface)',
              border: b.flag === 'stuck' ? '1.5px solid color-mix(in oklch, #d97757 60%, transparent)' : b.earned ? '1px solid var(--border)' : '1px dashed var(--border)',
              opacity: b.earned ? 1 : b.flag === 'stuck' ? 1 : 0.6,
              gridColumn: i === 6 ? 'span 3' : 'span 1',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 6px', borderRadius: 3, background: b.earned ? oliver.accent : b.flag === 'stuck' ? '#d97757' : 'var(--chip)', color: b.earned || b.flag === 'stuck' ? '#15120e' : 'var(--fg-muted)', fontWeight: 600 }}>{b.n}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{b.t}</span>
                {b.flag === 'stuck' && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#e89479', fontFamily: 'var(--mono)' }}>⚑ stuck</span>}
              </div>
              <div style={{ fontSize: 12, color: b.earned ? 'var(--fg)' : 'var(--fg-muted)', lineHeight: 1.45, fontStyle: b.v ? 'normal' : 'italic', minHeight: 34 }}>
                {b.v || 'Unwritten. Oliver will drop three candidate moves here when Casey unblocks him.'}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Screen>
  );
}

// ============================================================================
//  Cast dossier
// ============================================================================

export function CastView() {
  const characters = useStore(s => s.characters);
  return (
    <Screen title="Cast dossier" subtitle="Character state · Casey's write scope · read by everyone">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {characters.map(c => <CharacterCard key={c.id} c={c}/>)}
      </div>
    </Screen>
  );
}

function CharacterCard({ c }) {
  const agents = useStore(s => s.agents);
  const casey  = agents.find(a => a.id === 'casey');
  const empty  = c.triad.wound === '' || c.triad.wound === '[unknown]';
  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--chip)', color: 'var(--fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'var(--serif)' }}>{c.name.split(' ').map(x => x[0]).join('')}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.role} · depth {c.depth}%</div>
        </div>
        {empty && <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, padding: '3px 8px', borderRadius: 3, background: `color-mix(in oklch, ${casey.accent} 18%, transparent)`, color: casey.accent, letterSpacing: 1 }}>CASEY WORKING</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { k: 'Wound', v: c.triad.wound, c: '#e57373' },
          { k: 'Want',  v: c.triad.want,  c: casey.accent },
          { k: 'Need',  v: c.triad.need,  c: '#9fd3a6' },
        ].map(x => (
          <div key={x.k} style={{ padding: '10px 11px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: x.c, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>{x.k}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 13, lineHeight: 1.4, color: x.v ? 'var(--fg)' : 'var(--fg-muted)', fontStyle: x.v ? 'normal' : 'italic' }}>{x.v || '—'}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ============================================================================
//  World canon
// ============================================================================

export function WorldView() {
  const rules = useStore(s => s.worldRules);
  return (
    <Screen title="World canon" subtitle="Zoe's write scope · enforced across every scene">
      <Panel title="Rules" kicker={`${rules.length} ratified · ${rules.filter(r => r.conflict).length} conflict`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map(r => (
            <div key={r.id} style={{ padding: '10px 12px', borderRadius: 6, background: r.conflict ? 'color-mix(in oklch, #d97757 10%, var(--bg))' : 'var(--bg)', border: r.conflict ? '1px solid color-mix(in oklch, #d97757 45%, transparent)' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{r.id}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: r.conflict ? '#d97757' : 'var(--fg-muted)' }}>cited {r.cited}× {r.conflict && '· CONFLICT'}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{r.rule}</div>
              {r.conflict && <div style={{ marginTop: 6, fontSize: 11, color: '#e89479', fontFamily: 'var(--mono)', borderTop: '1px dashed color-mix(in oklch, #d97757 40%, transparent)', paddingTop: 6 }}>⚠ {r.conflict.sceneId} · {r.conflict.note}</div>}
            </div>
          ))}
        </div>
      </Panel>
    </Screen>
  );
}

// ============================================================================
//  Scene workspace
// ============================================================================

export function ScenesView() {
  const scenes = useStore(s => s.scenes);
  return (
    <Screen title="Scene workspace" subtitle="Every scene, every flag · multi-agent read zone">
      <Panel>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--fg-muted)', fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              <th style={th}>#</th>
              <th style={th}>Scene</th>
              <th style={th}>Beat</th>
              <th style={th}>Cast</th>
              <th style={th}>Words</th>
              <th style={th}>Status</th>
              <th style={th}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}><span style={{ fontFamily: 'var(--mono)', color: 'var(--fg-muted)' }}>{s.n}</span></td>
                <td style={td}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 13 }}>{s.title}</span>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{s.location}</div>
                </td>
                <td style={td}><Chip>{s.beatId}</Chip></td>
                <td style={td}><span style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{s.characters.map(c => c.split('/')[1]).join(', ')}</span></td>
                <td style={td}><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{s.wordCount}</span></td>
                <td style={td}><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: s.status === 'revising' ? '#e0c889' : 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.status}</span></td>
                <td style={td}>{s.flags.map(f => <span key={f} style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: '#d97757', marginRight: 6 }}>⚑ {f}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Screen>
  );
}

const th = { padding: '6px 10px', textAlign: 'left', fontWeight: 400 };
const td = { padding: '9px 10px', verticalAlign: 'top' };

// ============================================================================
//  Agent workbench
// ============================================================================

export function AgentWorkbench({ agentId }) {
  const agent  = useStore(s => s.agents.find(a => a.id === agentId));
  const tasks  = useStore(s => s.tasks.filter(t => t.assignedTo === agentId));
  const memory = useStore(s => s.memory.filter(m => m.source === agentId || m.witnesses.includes(agentId)));
  if (!agent) return null;

  const pitchByAgent = {
    sam:    "I compress stories. Logline, synopsis, query letter — all under version control, all pullable by Marcus at pitch time.",
    casey:  "I psychoanalyze your cast. Wound, want, need — then I defend that psychology against Maya's voice passes and Oliver's structural moves.",
    oliver: "I am the architect. Twelve beats, three acts, one truth: the midpoint is a true failure, not a setback.",
    maya:   "Every character speaks differently. I diff their voice prints and flag the lines where two characters sound like the same writer.",
    zoe:    "Canon is sacred. I keep the rules, enforce them scene-to-scene, and holler when you break your own world.",
    marcus: "I read the book. I write the scorecard. I assign the homework to everyone else — including Triage.",
  };

  return (
    <Screen
      title={`${agent.name}'s workbench`}
      subtitle={`${agent.role} · status: ${agent.status}`}
      actions={<button style={primaryBtn}>Open agent chat →</button>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>
        <Panel span={8} kicker="self-description">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <span style={{ width: 48, height: 48, borderRadius: 24, background: agent.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>{agent.letter}</span>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>{agent.name}</div>
              <div style={{ fontSize: 11, color: agent.accent, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2 }}>{agent.role}</div>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.5, color: 'var(--fg)', fontStyle: 'italic', margin: 0 }}>
            "{pitchByAgent[agent.id] || 'Specialist agent.'}"
          </p>
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 6, background: `color-mix(in oklch, ${agent.accent} 8%, transparent)`, border: `1px dashed color-mix(in oklch, ${agent.accent} 30%, transparent)` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: agent.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Current focus</div>
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>{agent.focus}</div>
          </div>
        </Panel>

        <Panel span={4} title="Scope" kicker="r/w boundaries">
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Reads from</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {agent.reads.map(r => <Chip key={r}>{r}</Chip>)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Writes to</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {agent.writes.map(r => <span key={r} style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 3, background: `color-mix(in oklch, ${agent.accent} 18%, transparent)`, color: agent.accent }}>{r}</span>)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Capabilities</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {agent.capabilities.map(c => <Chip key={c}>{c}</Chip>)}
          </div>
        </Panel>

        <Panel span={6} title="Active tasks" kicker={`${tasks.length} on this agent`}>
          {tasks.length === 0 && <Empty>No active tasks.</Empty>}
          {tasks.map(t => (
            <div key={t.id} style={{ padding: '9px 11px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: tintForTaskState(t.state), textTransform: 'uppercase', letterSpacing: 1 }}>{t.state}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>{t.id}</span>
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>{t.detail}</div>
            </div>
          ))}
        </Panel>

        <Panel span={6} title="Working memory" kicker={`${memory.length} entries in scope`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {memory.slice(-5).reverse().map(m => <WorkingMemoryItem key={m.id} m={m}/>)}
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function WorkingMemoryItem({ m }) {
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
