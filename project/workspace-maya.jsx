// Maya's Dialogue & Voice Coach workspace — voice comparator + scene doctor.

function MayaWorkspace() {
  const persona = PERSONAS[3];
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona="maya" project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio', 'Maya', 'Dialogue', 'Scene 14 · Hallway Confrontation']}
          persona={persona}
          actions={<><button style={pillBtn}>Read aloud</button><button style={pillBtn}>Compare voices</button></>}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 34px 40px', minWidth: 0 }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 6 }}>
                Maya's Room · Dialogue
              </div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>
                Your characters sound like <span style={{ color: persona.accent, fontStyle: 'italic' }}>you</span>, not themselves.
              </h1>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13.5, marginTop: 8, maxWidth: 620, lineHeight: 1.55 }}>
                I pulled Mara and Ivor's lines from Scene 14. Their word lengths, rhythms, and filler patterns are almost identical. Let's fix that.
              </p>
            </div>

            {/* Voice comparator */}
            <Card title="Voiceprints · Scene 14" subtitle="Two characters, measured across four axes" persona={persona}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 14, alignItems: 'center' }}>
                {[
                  { a: 'Word length',     m: 0.62, i: 0.66, note: 'Both medium-heavy' },
                  { a: 'Sentence rhythm', m: 0.48, i: 0.52, note: 'Both even-paced' },
                  { a: 'Contractions',    m: 0.81, i: 0.34, note: 'Mara casual, Ivor formal ✓' },
                  { a: 'Subtext density', m: 0.30, i: 0.28, note: 'Both say what they mean' },
                ].map((r, i) => (
                  <React.Fragment key={i}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{r.a}</div>
                    <Bar v={r.m} label="Mara" accent={persona.accent}/>
                    <Bar v={r.i} label="Ivor" accent="#9fd3a6"/>
                    <div/>
                    <div style={{ gridColumn: 'span 2', fontSize: 11, color: 'var(--fg-muted)', marginTop: -6, marginBottom: 4 }}>{r.note}</div>
                  </React.Fragment>
                ))}
              </div>
            </Card>

            {/* Scene doctor */}
            <Card title="Scene · page 47" subtitle="Hallway confrontation · 6 lines" persona={persona}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.8, color: 'var(--fg)' }}>
                <Line who="MARA" accent={persona.accent} text="What are you doing here?" note="— could cut, we see it"/>
                <Line who="IVOR" accent="#9fd3a6" text="I live here. What are you doing here?" flag="echo"/>
                <Line who="MARA" accent={persona.accent} text="I was looking for my sister's things." flag="onNose" note="she'd never admit this"/>
                <Line who="IVOR" accent="#9fd3a6" text="Your sister is dead."/>
                <Line who="MARA" accent={persona.accent} text="I know."/>
                <Line who="IVOR" accent="#9fd3a6" text="Do you?"/>
              </div>
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 6, border: `1px dashed color-mix(in oklch, ${persona.accent} 40%, transparent)`, background: `color-mix(in oklch, ${persona.accent} 6%, transparent)`, fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: persona.accent, marginRight: 6, letterSpacing: 0.5 }}>MAYA →</span>
                Line 3 is on-the-nose. Mara wouldn't admit the truth to a stranger she's afraid of. Try her lying badly: "I must have the wrong apartment." Let Ivor see the lie.
              </div>
            </Card>
          </div>

          <ChatPanel
            persona={persona}
            placeholder="Ask Maya anything…"
            messages={[
              { from: 'persona', text: `Alex! Let's make your characters come alive through their words.`, time: '14:12' },
              { from: 'user', text: `Paste from Scene 14?`, time: '14:13' },
              { from: 'persona', text: `Got it. Reading now. Three things jumped out — I'll mark them in the scene.`, time: '14:14', attach: 'scene-14 · 3 issues flagged' },
              { from: 'persona', typing: true, time: 'now' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Bar({ v, label, accent }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', marginBottom: 3 }}>
        <span>{label}</span><span>{Math.round(v*100)}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--chip)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${v*100}%`, height: '100%', background: accent }}/>
      </div>
    </div>
  );
}

function Line({ who, accent, text, flag, note }) {
  const flagColor = flag === 'echo' ? '#d97757' : flag === 'onNose' ? '#fbbf24' : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: accent, fontWeight: 600 }}>{who}</span>
      <span style={{ color: 'var(--fg)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, textDecoration: flag === 'onNose' ? 'underline wavy #fbbf24' : 'none', textUnderlineOffset: 4 }}>
        "{text}"
      </span>
      <span style={{ fontSize: 10, color: flagColor || 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
        {flag && <span style={{ padding: '1px 6px', borderRadius: 3, background: `color-mix(in oklch, ${flagColor} 18%, transparent)`, color: flagColor, marginRight: 6 }}>{flag}</span>}
        {note}
      </span>
    </div>
  );
}

Object.assign(window, { MayaWorkspace });
