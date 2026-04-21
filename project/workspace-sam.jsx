// Sam's Synopsis workspace — central column: Logline, Story essence, One-pager.
// Right rail: chat. Middle also shows the tool panel with "Brevity exercise".

function SamWorkspace() {
  const persona = PERSONAS[0];
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona="sam" project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio', 'Sam', 'Synopsis']}
          persona={persona}
          actions={<button style={pillBtn}>Save draft</button>}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* main */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px 40px', minWidth: 0 }}>
            {/* Title */}
            <div style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 6 }}>
                Sam's Room · Synopsis
              </div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 500, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>
                Let's strip your story down to its <span style={{ color: persona.accent, fontStyle: 'italic' }}>essence</span>.
              </h1>
              <p style={{ color: 'var(--fg-muted)', fontSize: 14, marginTop: 10, maxWidth: 620, lineHeight: 1.55 }}>
                You mentioned being too verbose in your pitches. We'll work from a ten-word pitch out — not the other way around.
              </p>
            </div>

            {/* Tool: Brevity ladder */}
            <Card title="Brevity Ladder" subtitle="Collapse your pitch progressively" persona={persona}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 14, alignItems: 'center' }}>
                {[
                  { n: '200 words', v: 'Drafted', val: 184, target: 200, tone: 'ok' },
                  { n: '60 words',  v: 'Drafted', val: 72, target: 60, tone: 'over' },
                  { n: '25 words',  v: 'In progress', val: 31, target: 25, tone: 'over' },
                  { n: '10 words',  v: 'Not started', val: 0, target: 10, tone: 'empty' },
                ].map((r, i) => (
                  <React.Fragment key={i}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{r.n}</div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--chip)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        height: '100%',
                        width: r.val === 0 ? '0%' : `${Math.min(100, (r.val / r.target) * 100)}%`,
                        background: r.tone === 'over' ? '#d97757' : persona.accent,
                        transition: 'width .3s',
                      }}/>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: r.tone === 'over' ? '#d97757' : 'var(--fg-muted)', minWidth: 70, textAlign: 'right' }}>
                      {r.val}/{r.target}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </Card>

            {/* Logline editor */}
            <Card title="Logline" subtitle="One sentence. Protagonist, want, obstacle, stakes." persona={persona} badge="25 words" badgeTone="over" count="31 / 25">
              <div style={{
                padding: '14px 16px', borderRadius: 7,
                background: 'var(--input)', border: '1px solid var(--border)',
                fontFamily: 'var(--serif)', fontSize: 18, lineHeight: 1.55,
                color: 'var(--fg)',
              }}>
                When a burned-out <u style={{ textDecorationColor: persona.accent, textDecorationThickness: 2, textUnderlineOffset: 3 }}>night-shift nurse</u> discovers her dead sister's apartment is still lived-in, she must <u style={{ textDecorationColor: persona.accent, textDecorationThickness: 2, textUnderlineOffset: 3 }}>trespass through a locked hallway</u> to find the truth — before the tenant finds her first.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Chip label="Protagonist" tone="ok" />
                <Chip label="Want" tone="ok" />
                <Chip label="Obstacle" tone="ok" />
                <Chip label="Stakes" tone="warn" hint="Vague — what does she lose?"/>
                <Chip label="Genre hook" tone="missing" />
              </div>
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 6, border: `1px dashed color-mix(in oklch, ${persona.accent} 40%, transparent)`, background: `color-mix(in oklch, ${persona.accent} 6%, transparent)`, fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: persona.accent, marginRight: 6, letterSpacing: 0.5 }}>SAM →</span>
                The stakes feel abstract. What's at risk if she fails — her own life, her sanity, her sister's memory? Pick one and make it concrete.
              </div>
            </Card>

            {/* Comparison titles */}
            <Card title="Comparison Titles" subtitle='Two recent, one evergreen. "X meets Y."' persona={persona}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { t: 'The Guest', y: '2014', note: 'Tone: unease + intrusion' },
                  { t: 'Saint Maud', y: '2019', note: 'Psychological creep, nurse POV' },
                  { t: 'Rear Window', y: '1954', note: 'Evergreen: watching from inside' },
                ].map((c, i) => (
                  <div key={i} style={{
                    padding: '12px 13px', borderRadius: 6,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500 }}>{c.t}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{c.y}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 8, lineHeight: 1.45 }}>{c.note}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <ChatPanel
            persona={persona}
            messages={[
              { from: 'persona', text: `Hi Alex! I see you struggle with being concise. Let's strip your story down to its essence.`, time: '10:04' },
              { from: 'persona', text: `Start with a ten-word pitch. Don't try to be clever — try to be true.`, time: '10:04', attach: 'brevity-ladder · 10-word rung' },
              { from: 'user', text: `A nurse trespasses in her dead sister's apartment to find who's still living there.`, time: '10:06' },
              { from: 'persona', text: `Good bones. "Nurse" and "dead sister" carry weight. Cut "who's still living there" — that's the mystery, not the pitch. Try it as: "A nurse breaks into her dead sister's apartment. Someone is still living there."`, time: '10:07' },
              { from: 'persona', typing: true, time: 'now' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, persona, badge, badgeTone, count }) {
  return (
    <section style={{
      padding: '18px 20px 20px', borderRadius: 9,
      background: 'var(--surface)', border: '1px solid var(--border)',
      marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 17, margin: 0, letterSpacing: -0.2 }}>{title}</h3>
        {badge && <span style={{
          fontSize: 10, fontFamily: 'var(--mono)',
          padding: '2px 7px', borderRadius: 4,
          background: badgeTone === 'over' ? 'color-mix(in oklch, #d97757 18%, transparent)' : 'var(--chip)',
          color: badgeTone === 'over' ? '#e89479' : 'var(--fg-muted)',
          textTransform: 'uppercase', letterSpacing: 0.8,
        }}>{badge}</span>}
        <div style={{ flex: 1 }}/>
        {count && <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{count}</div>}
      </div>
      {subtitle && <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginBottom: 14, marginTop: -6 }}>{subtitle}</div>}
      {children}
    </section>
  );
}

function Chip({ label, tone = 'ok', hint }) {
  const toneColor = {
    ok: { bg: 'color-mix(in oklch, #4ade80 14%, transparent)', fg: '#86efac', dot: '#4ade80' },
    warn: { bg: 'color-mix(in oklch, #fbbf24 14%, transparent)', fg: '#fde68a', dot: '#fbbf24' },
    missing: { bg: 'color-mix(in oklch, #d97757 12%, transparent)', fg: '#f4a488', dot: '#d97757' },
  }[tone];
  return (
    <span title={hint} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px 3px 7px', borderRadius: 999,
      background: toneColor.bg, fontSize: 11.5, color: toneColor.fg,
      fontFamily: 'var(--mono)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: toneColor.dot }}/>
      {label}{tone === 'missing' && ' ?'}
    </span>
  );
}

const pillBtn = {
  fontSize: 12, padding: '5px 11px', borderRadius: 6,
  background: 'var(--chip)', color: 'var(--fg)',
  border: '1px solid var(--border)', cursor: 'pointer',
  fontFamily: 'inherit',
};

Object.assign(window, { SamWorkspace, Card, Chip, pillBtn });
