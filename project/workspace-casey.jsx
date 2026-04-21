// Casey's Character Psychologist workspace — backstory, arc, voice.

function CaseyWorkspace() {
  const persona = PERSONAS[1];
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--sans)', minHeight: 0 }}>
      <Sidebar activePersona="casey" project="The Long Hallway" writer="Alex Chen" state="pages written · stuck" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          crumb={['Studio', 'Casey', 'Characters', 'Mara Aldine']}
          persona={persona}
          actions={<><button style={pillBtn}>+ Character</button><button style={pillBtn}>Export bible</button></>}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* character rail */}
          <div style={{ width: 180, borderRight: '1px solid var(--border)', padding: '14px 10px', background: 'var(--surface)', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '0 6px 8px', fontFamily: 'var(--mono)' }}>Cast · 4</div>
            {[
              { name: 'Mara Aldine', role: 'Protagonist', tag: 'M', active: true, depth: 82 },
              { name: 'Ivor Kade',   role: 'Antagonist',  tag: 'I', depth: 48 },
              { name: 'Elena Soler', role: 'Supporting',  tag: 'E', depth: 64 },
              { name: 'Det. Park',   role: 'Supporting',  tag: 'P', depth: 22 },
            ].map((c, i) => (
              <div key={i} style={{
                padding: '8px 8px', borderRadius: 6, marginBottom: 2,
                background: c.active ? `color-mix(in oklch, ${persona.accent} 15%, transparent)` : 'transparent',
                border: c.active ? `1px solid color-mix(in oklch, ${persona.accent} 30%, transparent)` : '1px solid transparent',
                display: 'flex', alignItems: 'center', gap: 9,
              }}>
                <PersonaDot letter={c.tag} accent={c.active ? persona.accent : 'var(--chip)'} size={26} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)' }}>{c.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{c.role} · {c.depth}%</div>
                </div>
              </div>
            ))}
          </div>

          {/* main */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 34px 40px', minWidth: 0 }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 6 }}>
                Casey's Room · Character
              </div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 500, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>
                Mara Aldine, 34
              </h1>
              <div style={{ color: 'var(--fg-muted)', fontSize: 13.5, marginTop: 6, fontStyle: 'italic' }}>
                "She doesn't knock. She's never been the one waiting on the other side of the door."
              </div>
            </div>

            {/* Wound + want + need triad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
              {[
                { k: 'Wound', v: "Left her sister's call unanswered the night she died.", hint: 'Childhood echo · abandonment', c: '#e57373' },
                { k: 'Want',  v: 'Proof that she isn\'t complicit. A closed case.', hint: 'External goal', c: persona.accent },
                { k: 'Need',  v: 'To grieve instead of investigate.', hint: 'Internal arc', c: '#9fd3a6' },
              ].map((x, i) => (
                <div key={i} style={{ padding: '14px 14px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)', position: 'relative' }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: x.c, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>{x.k}</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 14.5, lineHeight: 1.45, color: 'var(--fg)' }}>{x.v}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 8, fontFamily: 'var(--mono)' }}>{x.hint}</div>
                </div>
              ))}
            </div>

            {/* Arc line */}
            <Card title="Arc" subtitle="Negative → positive. Self-deception to self-acceptance." persona={persona}>
              <div style={{ position: 'relative', height: 70, marginTop: 8 }}>
                <svg width="100%" height="70" viewBox="0 0 600 70" preserveAspectRatio="none" style={{ display: 'block' }}>
                  <path d="M 10,52 C 120,52 180,18 300,36 C 420,54 500,20 590,12" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 3"/>
                  <path d="M 10,52 C 120,52 180,18 300,36" fill="none" stroke={persona.accent} strokeWidth="2"/>
                  {[
                    { x: 10, y: 52, on: true },
                    { x: 180, y: 24, on: true },
                    { x: 300, y: 36, on: true },
                    { x: 440, y: 42, on: false },
                    { x: 590, y: 12, on: false },
                  ].map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={p.on ? 5 : 4} fill={p.on ? persona.accent : 'var(--surface)'} stroke={p.on ? persona.accent : 'var(--fg-muted)'} strokeWidth="1.5"/>
                  ))}
                </svg>
                <div style={{ position: 'absolute', inset: 0, fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)', pointerEvents: 'none' }}>
                  {['Denial','Obsession','Collapse','Honesty','Release'].map((t, i) => (
                    <span key={i} style={{ position: 'absolute', left: `${i*25}%`, bottom: 0, transform: 'translateX(-50%)' }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 18, padding: '10px 12px', borderRadius: 6, border: `1px dashed color-mix(in oklch, ${persona.accent} 40%, transparent)`, background: `color-mix(in oklch, ${persona.accent} 6%, transparent)`, fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: persona.accent, marginRight: 6, letterSpacing: 0.5 }}>CASEY →</span>
                You have three beats earned. "Honesty" is where most writers flinch — give Mara a concrete moment where she says the thing out loud. Not to the detective. To herself.
              </div>
            </Card>

            {/* Voice snippets */}
            <Card title="Voice · Speech Pattern" subtitle="Three lines. Anger, fear, love." persona={persona}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { k: 'Angry', q: '"I don\'t need your condolences. I need the key."', tag: 'clipped · transactional' },
                  { k: 'Afraid', q: '"…the light under the door moved. It moved, Elena."', tag: 'fragments · repetition' },
                  { k: 'Loving', q: '"You don\'t have to say it back. Just — stay on the line."', tag: 'soft · asks permission' },
                ].map((v, i) => (
                  <div key={i} style={{ padding: '12px 13px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: persona.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>{v.k}</div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.5, fontStyle: 'italic', color: 'var(--fg)' }}>{v.q}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 10, fontFamily: 'var(--mono)' }}>{v.tag}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <ChatPanel
            persona={persona}
            placeholder="Ask Casey anything…"
            messages={[
              { from: 'persona', text: `Alex! Who are we bringing to life today?`, time: '09:32' },
              { from: 'user', text: `Mara. She feels flat. Like a plot device.`, time: '09:33' },
              { from: 'persona', text: `Good diagnosis. Characters go flat when the writer knows their WANT but not their WOUND. Let's work backwards — what happened at twelve that she'd never tell anyone?`, time: '09:34', attach: 'mara-aldine · backstory' },
              { from: 'user', text: `She didn't pick up her sister's call the night she died. Her sister left a voicemail.`, time: '09:38' },
              { from: 'persona', text: `Now we're in the room. Does Mara still have the voicemail? Has she played it?`, time: '09:39' },
              { from: 'persona', typing: true, time: 'now' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CaseyWorkspace });
