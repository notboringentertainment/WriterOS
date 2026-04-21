// Studio Home — the writer's bookshelf of personas, with the active project at top.

function StudioHome() {
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona={null} project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio']}
          persona={null}
          actions={<><button style={pillBtn}>+ New project</button><button style={pillBtn}>Run diagnostic</button></>}
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 52px 52px', minWidth: 0 }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 8 }}>
              Welcome back, Alex
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 500, letterSpacing: -0.8, margin: 0, lineHeight: 1.1 }}>
              Who do you need in the room today?
            </h1>
            <p style={{ color: 'var(--fg-muted)', fontSize: 14, marginTop: 10, maxWidth: 580, lineHeight: 1.55 }}>
              Six collaborators. One project. Pick who fits the problem you're actually having.
            </p>
          </div>

          {/* active project strip */}
          <div style={{
            padding: '16px 20px', borderRadius: 10, marginBottom: 32,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 18,
          }}>
            <div style={{
              width: 52, height: 68, borderRadius: 3, background: 'linear-gradient(180deg, #3a2f4a, #1e1825)',
              border: '1px solid rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0,
              boxShadow: '2px 3px 0 rgba(0,0,0,0.35)',
            }}>
              <div style={{ position: 'absolute', left: 4, right: 4, top: 14, height: 1, background: 'rgba(255,255,255,0.1)' }}/>
              <div style={{ position: 'absolute', left: 4, right: 4, top: 22, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
              <div style={{ position: 'absolute', bottom: 6, left: 5, right: 5, fontSize: 6.5, fontFamily: 'var(--serif)', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', textAlign: 'center' }}>A.Chen</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', letterSpacing: 1, textTransform: 'uppercase' }}>Active manuscript</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500, marginTop: 2 }}>The Long Hallway</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                Literary thriller · 62,400 words · 6 chapters drafted · <span style={{ color: '#e89479' }}>stuck at midpoint</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...pillBtn, background: 'var(--p-oliver)', color: '#15120e', borderColor: 'transparent' }}>Oliver · fix midpoint →</button>
              <button style={pillBtn}>Open manuscript</button>
            </div>
          </div>

          {/* persona shelf */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {PERSONAS.map(p => (
              <PersonaCard key={p.id} p={p} />
            ))}
          </div>

          {/* recents */}
          <div style={{ marginTop: 36 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 12 }}>
              Recent sessions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {[
                { p: PERSONAS[1], what: 'Mara · wound + want + need', when: '2h ago' },
                { p: PERSONAS[0], what: 'Synopsis · draft 3 (query-ready)', when: 'yesterday' },
                { p: PERSONAS[5], what: 'Chapters 1–6 · developmental notes', when: '3d ago' },
                { p: PERSONAS[3], what: 'Scene 14 · voice comparator', when: '5d ago' },
              ].map((r, i, arr) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <PersonaDot letter={r.p.letter} accent={r.p.accent} size={26}/>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}><span style={{ color: 'var(--fg)' }}>{r.p.name}</span> · {r.what}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{r.when}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonaCard({ p }) {
  return (
    <div style={{
      padding: 16, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)',
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(120% 60% at 0% 0%, color-mix(in oklch, ${p.accent} 14%, transparent), transparent 60%)`,
        pointerEvents: 'none',
      }}/>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <PersonaDot letter={p.letter} accent={p.accent} size={42}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500 }}>{p.name}</div>
          <div style={{ fontSize: 11, color: p.accent, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 }}>{p.role}</div>
        </div>
      </div>
      <div style={{ position: 'relative', fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55, minHeight: 54 }}>
        {p.desc}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>best for</span>
        {p.best.map((t, i) => (
          <span key={i} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 3, background: 'var(--chip)', color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{t}</span>
        ))}
        <span style={{ marginLeft: 'auto', color: p.accent, fontSize: 12, fontFamily: 'var(--mono)' }}>enter →</span>
      </div>
    </div>
  );
}

Object.assign(window, { StudioHome });
