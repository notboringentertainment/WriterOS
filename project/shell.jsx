// Shared WriterOS shell — sidebar with personas, topbar with breadcrumb.
// Consumed by each workspace artboard.

const PERSONAS = [
  { id: 'sam',    name: 'Sam',    letter: 'S', role: 'Synopsis Specialist',      accent: 'var(--p-sam)',    hint: 'Logline & pitch',
    desc: 'Turns your messy manuscript into a one-page pitch. Query letters, loglines, comp titles.',
    best: ['query', 'logline', 'pitch'] },
  { id: 'casey',  name: 'Casey',  letter: 'C', role: 'Character Psychologist',   accent: 'var(--p-casey)',  hint: 'Backstory & arcs',
    desc: "Interrogates your characters until they're unforgettable. Wound, want, need. Arcs that earn the ending.",
    best: ['backstory', 'arc', 'voice'] },
  { id: 'oliver', name: 'Oliver', letter: 'O', role: 'Story Structure Editor',   accent: 'var(--p-oliver)', hint: 'Beats & pacing',
    desc: 'Diagnoses a sagging middle or a soft climax. Save the Cat, Hero\'s Journey, or your own frame.',
    best: ['beats', 'pacing', 'midpoint'] },
  { id: 'maya',   name: 'Maya',   letter: 'M', role: 'Dialogue & Voice Coach',   accent: 'var(--p-maya)',   hint: 'Voice & subtext',
    desc: "Makes your characters stop sounding like you. Voiceprints, subtext, the line you forgot to cut.",
    best: ['dialogue', 'subtext', 'voice'] },
  { id: 'zoe',    name: 'Zoe',    letter: 'Z', role: 'World-Building Architect', accent: 'var(--p-zoe)',    hint: 'Settings & rules',
    desc: "Holds your world's rules. Catches the dropped thread three chapters before your reader does.",
    best: ['rules', 'glossary', 'canon'] },
  { id: 'marcus', name: 'Marcus', letter: 'M', role: 'Editor & Critic',          accent: 'var(--p-alex)',   hint: 'Hard reads',
    desc: "The honest developmental edit. Scorecards, line edits, notes you don't want and do need.",
    best: ['dev edit', 'line edit', 'notes'] },
];

const pillBtn = {
  padding: '5px 11px', borderRadius: 5, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--fg)', fontSize: 12, fontFamily: 'inherit',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};

function Card({ title, subtitle, persona, children }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function PersonaDot({ letter, accent, size = 28, active }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size/2,
      background: accent, color: '#15120e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: size * 0.44, letterSpacing: -0.2,
      fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: active ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${accent}` : 'none',
      flexShrink: 0,
    }}>{letter}</div>
  );
}

function Sidebar({ activePersona = 'sam', project = 'Untitled Project', writer = 'Alex Chen', state = 'pages written · stuck', onSelect }) {
  const go = (id) => { if (window.__setRoom) window.__setRoom(id); if (onSelect) onSelect(id); };
  return (
    <aside style={{
      width: 248, height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
      color: 'var(--fg)',
    }}>
      {/* Brand */}
      <div onClick={() => go('home')} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 60%, #000))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#0f0b13" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 13L13 3M10 3h3v3"/>
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 16, letterSpacing: -0.3, color: 'var(--fg)' }}>WriterOS</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>Personal Writing Studio</div>
        </div>
      </div>

      {/* Project pill */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current Project</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500 }}>{project}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, background: 'var(--chip)', color: 'var(--fg-muted)', letterSpacing: 0.1 }}>Thriller</span>
          <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, background: 'var(--chip)', color: 'var(--fg-muted)' }}>Screenplay</span>
        </div>
      </div>

      {/* Writer state */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Writer</div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{writer}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, fontFamily: 'var(--mono)' }}>{state}</div>
      </div>

      {/* Specialists */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 10px' }}>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '0 6px 8px' }}>Writing Specialists</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {PERSONAS.map(p => {
            const active = p.id === activePersona;
            return (
              <div key={p.id} onClick={() => go(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 8px', borderRadius: 6,
                background: active ? 'var(--row-active)' : 'transparent',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in oklch, var(--row-active) 55%, transparent)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                {active && <div style={{ position: 'absolute', left: -10, top: 8, bottom: 8, width: 2, borderRadius: 2, background: p.accent }} />}
                <PersonaDot letter={p.name[0]} accent={p.accent} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.role}</div>
                </div>
                {active && (
                  <div style={{ width: 5, height: 5, borderRadius: 3, background: p.accent, boxShadow: `0 0 6px ${p.accent}` }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: 'color-mix(in oklch, var(--primary) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>AC</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Alex Chen</div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn icon="settings" />
          <IconBtn icon="theme" />
        </div>
      </div>
    </aside>
  );
}

function IconBtn({ icon }) {
  const paths = {
    settings: <path d="M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M13 8c0-.4 0-.7-.1-1l1-.8-1-1.7-1.2.5a4 4 0 00-1.7-1L9.7 2.6H7l-.3 1.4a4 4 0 00-1.7 1l-1.2-.5-1 1.7 1 .8A4 4 0 003 8c0 .4 0 .7.1 1l-1 .8 1 1.7 1.2-.5a4 4 0 001.7 1l.3 1.4h2.6l.3-1.4a4 4 0 001.7-1l1.2.5 1-1.7-1-.8c.1-.3.1-.6.1-1z"/>,
    theme: <><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.5 3.5l.8.8M11.7 11.7l.8.8M3.5 12.5l.8-.8M11.7 4.3l.8-.8"/><circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/></>,
  };
  return (
    <button style={{
      width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
      color: 'var(--fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {paths[icon]}
      </svg>
    </button>
  );
}

function Topbar({ crumb = [], persona, actions }) {
  return (
    <div style={{
      height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid var(--border)', padding: '0 20px',
      background: 'var(--bg)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--fg-muted)' }}>
        {crumb.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
            <span style={{ color: i === crumb.length - 1 ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: i === crumb.length - 1 ? 500 : 400 }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        {persona && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px 4px 5px', borderRadius: 999, background: 'var(--chip)' }}>
            <PersonaDot letter={persona.name[0]} accent={persona.accent} size={20} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{persona.name}</span>
            <span style={{ width: 5, height: 5, borderRadius: 3, background: '#4ade80', boxShadow: '0 0 5px #4ade80' }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel({ persona, messages = [], placeholder = 'Ask Sam anything…' }) {
  return (
    <aside style={{
      width: 340, borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', background: 'var(--surface)',
      flexShrink: 0, minHeight: 0,
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <PersonaDot letter={persona.name[0]} accent={persona.accent} size={32} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{persona.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{persona.role}</div>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: '#4ade80' }} />
          online
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        {messages.map((m, i) => (
          <ChatMsg key={i} {...m} persona={persona} />
        ))}
      </div>

      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: 'var(--bg)', border: '1px solid var(--border)',
        }}>
          <input placeholder={placeholder} style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: 'var(--fg)', fontFamily: 'inherit',
          }}/>
          <button style={{
            width: 26, height: 26, borderRadius: 5, border: 'none',
            background: persona.accent, color: '#15120e',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6l8-4-3 8-1.5-3.5L2 6z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 6, fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between' }}>
          <span>⏎ send · ⇧⏎ new line</span>
          <span>Memory: synced</span>
        </div>
      </div>
    </aside>
  );
}

function ChatMsg({ from, text, time, persona, typing, attach }) {
  if (from === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
        <div style={{
          background: 'color-mix(in oklch, var(--primary) 22%, var(--surface))',
          border: '1px solid color-mix(in oklch, var(--primary) 35%, transparent)',
          padding: '9px 12px', borderRadius: '10px 10px 2px 10px',
          fontSize: 13, lineHeight: 1.5, color: 'var(--fg)',
        }}>{text}</div>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 3, textAlign: 'right', fontFamily: 'var(--mono)' }}>{time}</div>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: '92%' }}>
      <div style={{
        background: `color-mix(in oklch, ${persona.accent} 10%, var(--bg))`,
        border: `1px solid color-mix(in oklch, ${persona.accent} 20%, transparent)`,
        padding: '10px 13px', borderRadius: '10px 10px 10px 2px',
        fontSize: 13, lineHeight: 1.55, color: 'var(--fg)',
      }}>
        {typing ? <TypingDots accent={persona.accent}/> : text}
        {attach && (
          <div style={{
            marginTop: 10, padding: '9px 10px',
            background: 'var(--surface)', borderRadius: 6,
            border: '1px solid var(--border)',
            fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: persona.accent }} />
            {attach}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 3, fontFamily: 'var(--mono)' }}>{persona.name.toLowerCase()} · {time}</div>
    </div>
  );
}

function TypingDots({ accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: 3, background: accent,
          animation: `dot 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}/>
      ))}
      <style>{`@keyframes dot { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }`}</style>
    </div>
  );
}

Object.assign(window, { PERSONAS, PersonaDot, Sidebar, Topbar, ChatPanel, ChatMsg, IconBtn, pillBtn, Card });
