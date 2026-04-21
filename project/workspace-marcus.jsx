// Marcus's Editor & Critic workspace — developmental notes, line edits, scorecard.

function MarcusWorkspace() {
  const persona = PERSONAS[5];
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona="marcus" project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio', 'Marcus', 'Notes', 'Chapters 1–6 · first pass']}
          persona={persona}
          actions={<><button style={pillBtn}>Line edit mode</button><button style={pillBtn}>Developmental pass</button></>}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 34px 40px', minWidth: 0 }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 6 }}>
                Marcus's Room · Editorial
              </div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>
                Chapters 1–6. <span style={{ color: persona.accent, fontStyle: 'italic' }}>The honest read.</span>
              </h1>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13.5, marginTop: 8, maxWidth: 640, lineHeight: 1.55 }}>
                I'll be direct. The prose is competent, occasionally beautiful. The structure is where you're bleeding out. Here's the scorecard.
              </p>
            </div>

            {/* Scorecard */}
            <Card title="Scorecard · first six chapters" persona={persona}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { k: 'Prose',     v: 'B+', note: 'Clean. Occasionally sings.',     c: persona.accent },
                  { k: 'Character', v: 'B-', note: 'Mara is close. Ivor is a prop.', c: '#e0c889' },
                  { k: 'Structure', v: 'D',  note: 'Midpoint is vapor.',              c: '#d97757' },
                  { k: 'Voice',     v: 'A-', note: 'This is your strength. Trust it.', c: '#9fd3a6' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '14px 12px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>{s.k}</div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 500, color: s.c, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 8, lineHeight: 1.45 }}>{s.note}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Dev notes */}
            <Card title="Developmental notes · 3 big ones" subtitle="In priority order" persona={persona}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { n: 1, t: 'You are writing around the sister\'s death.',
                    b: "Six chapters in and we still haven't heard the voicemail. That's the book. Stop protecting your protagonist from her own backstory." },
                  { n: 2, t: 'Ivor needs a want that isn\'t ominous.',
                    b: 'Right now he exists to be suspicious. Give him a daylight goal — a cat, a deadline, a daughter — that costs him when Mara intrudes.' },
                  { n: 3, t: 'Chapter 3 is setup you already did in Chapter 1.',
                    b: 'Cut it. Move the landlord\'s letter earlier. You\'ll gain 14 pages and an inciting incident that actually lands.' },
                ].map((d, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, padding: '12px 14px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: persona.accent, color: '#15120e',
                      fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{d.n}</div>
                    <div>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{d.t}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{d.b}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Line edit sample */}
            <Card title="Line edit · page 3" subtitle="Your opening paragraph, annotated" persona={persona}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.7, color: 'var(--fg)', padding: '4px 2px' }}>
                The hospital at 4am was <del style={{ color: '#d97757', textDecorationColor: '#d97757' }}>absolutely</del> quiet,
                <ins style={{ background: `color-mix(in oklch, ${persona.accent} 16%, transparent)`, textDecoration: 'none', padding: '0 3px', borderRadius: 2 }}> </ins>
                the kind of quiet that <del style={{ color: '#d97757', textDecorationColor: '#d97757' }}>somehow</del> pressed against the windows.
                Mara <del style={{ color: '#d97757', textDecorationColor: '#d97757' }}>slowly</del> pulled her coat tighter
                <ins style={{ background: `color-mix(in oklch, ${persona.accent} 16%, transparent)`, textDecoration: 'none', padding: '0 3px', borderRadius: 2 }}> around her ribs</ins>.
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, border: `1px dashed color-mix(in oklch, ${persona.accent} 40%, transparent)`, background: `color-mix(in oklch, ${persona.accent} 6%, transparent)`, fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: persona.accent, marginRight: 6, letterSpacing: 0.5 }}>MARCUS →</span>
                Three adverbs in two sentences. Trust your verbs. "Around her ribs" locates the grief in her body — do this more.
              </div>
            </Card>
          </div>

          <ChatPanel
            persona={persona}
            placeholder="Ask Marcus anything…"
            messages={[
              { from: 'persona', text: `Alex. Ready for the hard read?`, time: '08:41' },
              { from: 'user', text: `Go.`, time: '08:41' },
              { from: 'persona', text: `Good answer. I finished chapters 1–6 last night. Scorecard is on the board. The prose is fine. You know that. Let's talk about what isn't.`, time: '08:42', attach: 'chapters 1–6 · scorecard' },
              { from: 'persona', typing: true, time: 'now' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MarcusWorkspace });
