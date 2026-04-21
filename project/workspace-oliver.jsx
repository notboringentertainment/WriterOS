// Oliver's Structure workspace — beat board with a flagged stuck midpoint.

function OliverWorkspace() {
  const persona = PERSONAS[2];
  const beats = [
    { act: 1, n: '1', t: 'Opening Image',   v: 'Mara clocks out of a night shift. Hospital corridor. Alone.', on: true },
    { act: 1, n: '2', t: 'Inciting',        v: 'Letter from her dead sister\'s landlord. Rent is paid.',       on: true },
    { act: 1, n: '3', t: 'Debate',          v: 'Does she call the police, or go herself?',                     on: true },
    { act: 1, n: '4', t: 'Break into II',   v: 'She pockets the spare key. Crosses the city.',                 on: true },
    { act: 2, n: '5', t: 'Fun & Games',     v: 'She lives in the apartment. Studies the tenant\'s routine.',   on: true },
    { act: 2, n: '6', t: 'B-Story',         v: 'Detective Park circles her, misreads her grief as guilt.',     on: true },
    { act: 2, n: '7', t: 'Midpoint',        v: '???  —  protagonist has not yet failed',                       on: false, flag: 'stuck' },
    { act: 2, n: '8', t: 'Bad Guys Close',  v: '',                                                             on: false },
    { act: 2, n: '9', t: 'All Is Lost',     v: '',                                                             on: false },
    { act: 3, n:'10', t: 'Break into III',  v: '',                                                             on: false },
    { act: 3, n:'11', t: 'Finale',          v: '',                                                             on: false },
    { act: 3, n:'12', t: 'Final Image',     v: '',                                                             on: false },
  ];
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona="oliver" project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio', 'Oliver', 'Structure', 'Save the Cat · 12 beats']}
          persona={persona}
          actions={<><button style={pillBtn}>Save the Cat · 12 beats ▾</button><button style={pillBtn}>Import outline</button></>}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '26px 34px 40px', minWidth: 0 }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 6 }}>
                Oliver's Room · Structure
              </div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>
                You're stalled at the midpoint. Let's diagnose it.
              </h1>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13.5, marginTop: 8, maxWidth: 620, lineHeight: 1.55 }}>
                You have six beats earned. The midpoint is where the protagonist must <em>truly fail</em> — not get a setback. What's the worst possible version of her current win?
              </p>
            </div>

            {/* Act timeline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8, marginBottom: 14, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--fg-muted)' }}>
              <div style={{ textAlign: 'center', padding: '4px 0', background: 'var(--chip)', borderRadius: 4 }}>ACT I · setup · 25%</div>
              <div style={{ textAlign: 'center', padding: '4px 0', background: `color-mix(in oklch, ${persona.accent} 18%, transparent)`, color: persona.accent, borderRadius: 4 }}>ACT II · rising · 50%</div>
              <div style={{ textAlign: 'center', padding: '4px 0', background: 'var(--chip)', borderRadius: 4 }}>ACT III · climax · 25%</div>
            </div>

            {/* Beat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {beats.map((b, i) => (
                <div key={i} style={{
                  padding: '11px 12px', borderRadius: 6,
                  background: b.flag === 'stuck' ? `color-mix(in oklch, #d97757 12%, var(--surface))` : 'var(--surface)',
                  border: b.flag === 'stuck'
                    ? `1.5px solid color-mix(in oklch, #d97757 60%, transparent)`
                    : b.on ? '1px solid var(--border)' : '1px dashed var(--border)',
                  opacity: b.on ? 1 : b.flag ? 1 : 0.55,
                  gridColumn: i === 6 ? 'span 3' : 'span 1',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 10,
                      padding: '2px 6px', borderRadius: 3,
                      background: b.on ? persona.accent : b.flag ? '#d97757' : 'var(--chip)',
                      color: b.on || b.flag ? '#15120e' : 'var(--fg-muted)',
                      fontWeight: 600,
                    }}>{b.n}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{b.t}</span>
                    {b.flag === 'stuck' && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#e89479', fontFamily: 'var(--mono)' }}>⚑ stuck</span>}
                  </div>
                  <div style={{ fontSize: 12, color: b.on ? 'var(--fg)' : 'var(--fg-muted)', lineHeight: 1.45, fontStyle: b.v ? 'normal' : 'italic', minHeight: 34 }}>
                    {b.v || 'Drag a moment here, or let Oliver suggest three.'}
                  </div>
                </div>
              ))}
            </div>

            {/* Oliver nudge */}
            <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 8, border: `1px solid color-mix(in oklch, ${persona.accent} 30%, transparent)`, background: `color-mix(in oklch, ${persona.accent} 6%, transparent)` }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: persona.accent, letterSpacing: 0.8, marginBottom: 6 }}>OLIVER · MIDPOINT CLINIC</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg)' }}>
                Three ways Mara can truly fail here. Pick the one that hurts most:
              </div>
              <ol style={{ margin: '10px 0 0', paddingLeft: 22, fontSize: 12.5, lineHeight: 1.6, color: 'var(--fg)' }}>
                <li>The tenant knows she's been there. Has known for days. <span style={{ color: 'var(--fg-muted)' }}>— reverses power</span></li>
                <li>The voicemail was never deleted. She's been avoiding it. <span style={{ color: 'var(--fg-muted)' }}>— internal failure</span></li>
                <li>Detective Park arrests the wrong person because of her. <span style={{ color: 'var(--fg-muted)' }}>— moral cost</span></li>
              </ol>
            </div>
          </div>

          <ChatPanel
            persona={persona}
            placeholder="Ask Oliver anything…"
            messages={[
              { from: 'persona', text: `Hey Alex! Ready to build out your story structure?`, time: '11:02' },
              { from: 'user', text: `I'm stuck at the midpoint. It keeps feeling like filler.`, time: '11:03' },
              { from: 'persona', text: `Filler means the protagonist hasn't truly failed yet. A midpoint is a false victory OR a devastating loss — never "stuff happens." Show me beat 6 again.`, time: '11:04' },
              { from: 'persona', typing: true, time: 'now' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OliverWorkspace });
