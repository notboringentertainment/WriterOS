import React from 'react';
import { useStore } from './frame.jsx';
import { store } from '../lib/store.js';
import { Screen, Panel, Chip } from './primitives.jsx';

// ============================================================================
//  State inspector
// ============================================================================

export function StateInspector() {
  const all = useStore(s => s);
  const [path, setPath] = React.useState('');

  const slice = path ? getPath(all, path) : all;

  return (
    <Screen title="State inspector" subtitle="Live ProjectState · this is exactly what every agent sees">
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14 }}>
        <Panel title="Schema" kicker="top-level keys">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.keys(all).map(k => {
              const v = all[k];
              const kind = Array.isArray(v) ? `[] · ${v.length}` : typeof v === 'object' ? '{}' : typeof v;
              return (
                <button key={k} onClick={() => setPath(k)} style={{
                  textAlign: 'left', padding: '5px 8px', borderRadius: 4, border: 'none',
                  background: path === k ? 'var(--row-active)' : 'transparent',
                  color: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{k}</span>
                  <span style={{ color: 'var(--fg-muted)' }}>{kind}</span>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Schema v{all.schemaVersion}</div>
            <div>src/lib/schema.js defines shapes.</div>
            <div>lib/bridge.js routes all writes.</div>
            <div>lib/store.js is the subscription surface.</div>
          </div>
        </Panel>

        <Panel title={path || 'Root'} kicker="live value · updates as the store mutates">
          <pre style={{
            margin: 0, padding: '12px 14px', borderRadius: 6,
            background: 'var(--bg)', border: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.55,
            color: 'var(--fg)', maxHeight: 520, overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            <SyntaxJSON value={slice}/>
          </pre>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            In production, this same tree is served over WebSocket. Mutations flow: <span style={{ fontFamily: 'var(--mono)', color: 'var(--primary)' }}>UI → store.actions → bridge → backend → broadcast → store.applyPatch → UI</span>.
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function SyntaxJSON({ value }) {
  const str = JSON.stringify(value, null, 2);
  const lines = (str || 'undefined').split('\n');
  return <>{lines.map((l, i) => {
    const m = l.match(/^(\s*)"([^"]+)":\s*(.*)$/);
    if (m) return <div key={i}>{m[1]}<span style={{ color: 'var(--p-sam)' }}>"{m[2]}"</span>: {colorVal(m[3])}</div>;
    return <div key={i}>{colorVal(l)}</div>;
  })}</>;
}

function colorVal(s) {
  if (/^\s*"/.test(s)) return <span style={{ color: '#9fd3a6' }}>{s}</span>;
  if (/^\s*(true|false|null)/.test(s)) return <span style={{ color: 'var(--primary)' }}>{s}</span>;
  if (/^\s*-?[\d.]+/.test(s)) return <span style={{ color: '#e0c889' }}>{s}</span>;
  return <span style={{ color: 'var(--fg)' }}>{s}</span>;
}

function getPath(obj, path) {
  return path.split('.').reduce((a, k) => a?.[k], obj);
}

// ============================================================================
//  Future modules
// ============================================================================

export function FutureModules() {
  const mods = [
    { icon: '🎙', title: 'Voice War Room',      sub: 'Maya-led collaborative scene',
      body: 'Real-time dialogue pass with the full cast loaded. Casey holds psychology, Zoe holds canon, Maya drives voice — all three annotating the same lines.',
      slot: 'rooms/voice-war-room',   tint: 'var(--p-maya)' },
    { icon: '📱', title: 'Mobile Inbox',         sub: 'Async notes from your phone',
      body: 'Every agent posts short card-sized updates — "locked Mara voicemail", "structure diverged at b8". Pull-to-refresh surface.',
      slot: 'rooms/mobile-inbox',     tint: 'var(--primary)' },
    { icon: '🧠', title: 'Self-Awareness Panel', sub: 'How the system feels about itself',
      body: 'Confidence deltas, stuck-detector, "what I would do if I were the author" notes. This is the meta-agent that watches the other agents.',
      slot: 'rooms/meta',             tint: 'var(--p-casey)' },
    { icon: '📅', title: 'Writing Schedule',     sub: 'Rhythm aware · Sam + Oliver cross-check',
      body: 'Ingests your calendar, your sleep, your past stall patterns. Recommends which agent to open today and how long to stay there.',
      slot: 'rooms/schedule',         tint: 'var(--p-oliver)' },
    { icon: '🎬', title: 'Staged Reading',       sub: 'Maya performs scenes out loud',
      body: 'Voice synthesis per character, played back while you follow the page. Flags where the reading drags or lands on a flat beat.',
      slot: 'rooms/staged-reading',   tint: 'var(--p-maya)' },
    { icon: '🔌', title: 'External Agents',      sub: 'Plug in your own specialists',
      body: 'Drop in a Researcher agent, a Historical Accuracy checker, a Sensitivity reader. The Triage router adapts.',
      slot: 'rooms/external',         tint: 'var(--p-zoe)' },
  ];
  return (
    <Screen title="Future modules" subtitle="Rooms the current architecture already supports — just not rendered yet">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {mods.map(m => (
          <Panel key={m.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500 }}>{m.title}</div>
                <div style={{ fontSize: 10.5, color: m.tint, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>{m.sub}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--fg)' }}>{m.body}</div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)' }}>mount slot →</span>
              <Chip>{m.slot}</Chip>
            </div>
          </Panel>
        ))}
      </div>
    </Screen>
  );
}

// ============================================================================
//  Settings
// ============================================================================

export function SettingsView() {
  const agents = useStore(s => s.agents);
  return (
    <Screen title="Settings" subtitle="Runtime · storage · agent tuning">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <Panel title="Runtime" kicker="where agents live">
          <Setting k="Agent host"  v="claude-code (local)" editable/>
          <Setting k="Model route" v="claude-haiku-4.5 · coordinator · claude-sonnet-4.5 · specialists"/>
          <Setting k="Streaming"   v="websocket /ws/state"/>
          <Setting k="Fallback"    v="REST /api/state (poll 5s)"/>
        </Panel>
        <Panel title="Storage" kicker="persistence layer">
          <Setting k="Project file" v="~/WriterOS/the-long-hallway.wos"/>
          <Setting k="Autosave"     v="every keystroke · debounced 600ms"/>
          <Setting k="Memory ttl"   v="canon: forever · inferred: 30d decay · decaying: 7d"/>
        </Panel>
        <Panel title="Agents" kicker="turn them on / off">
          {agents.filter(a => a.id !== 'triage').map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: a.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{a.letter}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{a.role}</div>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1 }}>enabled</span>
            </div>
          ))}
        </Panel>
        <Panel title="Session" kicker="this user">
          <Setting k="Author"    v="Alex Chen · writer.exports.log"/>
          <Setting k="Licence"   v="pro · claude+code entitlement"/>
          <Setting k="Telemetry" v="agent-local only · never shipped"/>
        </Panel>
      </div>
    </Screen>
  );
}

function Setting({ k, v, editable }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ width: 130, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1 }}>{k}</span>
      <span style={{ flex: 1, fontFamily: 'var(--mono)' }}>{v}</span>
      {editable && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--primary)', cursor: 'pointer' }}>edit</span>}
    </div>
  );
}
