// Zoe's World-Building Architect workspace — rules, glossary, consistency check.

function ZoeWorkspace() {
  const persona = PERSONAS[4];
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona="zoe" project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio', 'Zoe', 'World', 'The Hallway Building']}
          persona={persona}
          actions={<><button style={pillBtn}>+ Rule</button><button style={pillBtn}>Run consistency check</button></>}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 34px 40px', minWidth: 0 }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 6 }}>
                Zoe's Room · World
              </div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>
                A building with rules. <span style={{ color: persona.accent, fontStyle: 'italic' }}>Keep them.</span>
              </h1>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13.5, marginTop: 8, maxWidth: 620, lineHeight: 1.55 }}>
                Your world doesn't need magic to break. One contradicted rule and readers stop believing. I found two.
              </p>
            </div>

            {/* Rules */}
            <Card title="World Rules · The Hallway" subtitle="Internal logic, enforced across scenes" persona={persona}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { t: 'The elevator only services floors 1–9. The 10th floor uses a stairwell key.', ok: true, cited: 4 },
                  { t: 'Mail is delivered at 7am. Residents are asleep.', ok: true, cited: 2 },
                  { t: 'The building has no CCTV on residential floors. Lobby only.', ok: true, cited: 3 },
                  { t: "Mara's apartment key opens 10B but not 10A.", ok: false, cited: 1, conflict: 'Scene 22 has her entering 10A with the same key.' },
                  { t: 'Detective Park needs a warrant to enter any unit.', ok: false, cited: 2, conflict: 'Scene 9 shows him in 10B without one.' },
                ].map((r, i) => (
                  <div key={i} style={{
                    padding: '10px 12px', borderRadius: 6,
                    background: r.ok ? 'var(--surface)' : 'color-mix(in oklch, #d97757 10%, var(--surface))',
                    border: r.ok ? '1px solid var(--border)' : '1px solid color-mix(in oklch, #d97757 45%, transparent)',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, marginTop: 1, flexShrink: 0,
                      background: r.ok ? `color-mix(in oklch, ${persona.accent} 70%, transparent)` : '#d97757',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="#15120e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {r.ok ? <path d="M1.5 4.5l2 2 4-4"/> : <path d="M1.5 1.5l6 6M7.5 1.5l-6 6"/>}
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 14.5, lineHeight: 1.45 }}>{r.t}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                        cited in {r.cited} scene{r.cited===1?'':'s'}{r.conflict && <> · <span style={{ color: '#e89479' }}>conflict: {r.conflict}</span></>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Glossary */}
            <Card title="Glossary" subtitle="Five terms so far. Use consistently." persona={persona}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { w: 'The Hallway',     d: 'The 10th-floor corridor. Always capitalized.' },
                  { w: 'Night-shift nurse', d: 'Never "night nurse" — Mara rejects the shorthand.' },
                  { w: 'Spare key',       d: 'The key her sister left with her. Never "key" alone in text.' },
                  { w: 'The Super',       d: 'Building manager. No name given until act III reveal.' },
                ].map((g, i) => (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600, color: persona.accent }}>{g.w}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, lineHeight: 1.45 }}>{g.d}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <ChatPanel
            persona={persona}
            placeholder="Ask Zoe anything…"
            messages={[
              { from: 'persona', text: `Welcome Alex! What world are we creating today?`, time: '16:01' },
              { from: 'user', text: `Just the one building. No magic. But I keep contradicting myself about the keys.`, time: '16:03' },
              { from: 'persona', text: `Grounded worlds break hardest when small physical rules slip. I indexed every mention of a key — found two conflicts. Fix these and the tension survives.`, time: '16:04', attach: 'rules · 2 conflicts' },
              { from: 'persona', typing: true, time: 'now' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ZoeWorkspace });
