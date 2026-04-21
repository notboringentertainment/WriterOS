import React from 'react';

export function Screen({ title, subtitle, actions, children }) {
  return (
    <div style={{ padding: '24px 28px 40px', color: 'var(--fg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 22, gap: 20 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 500, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 6, fontFamily: 'var(--mono)' }}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Panel({ span = 12, title, kicker, children }) {
  return (
    <section style={{ gridColumn: span === 12 ? undefined : `span ${span}`, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', minWidth: 0 }}>
      {(title || kicker) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          {title && <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500 }}>{title}</div>}
          {kicker && <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--mono)' }}>{kicker}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tint }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 1.2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: tint || 'var(--fg)', marginTop: 2, fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  );
}

export function Chip({ children }) {
  return <span style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 3, background: 'var(--chip)', color: 'var(--fg-muted)' }}>{children}</span>;
}

export function Empty({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>{children}</div>;
}

export const primaryBtn = {
  padding: '6px 12px', borderRadius: 5, border: 'none',
  background: 'var(--primary)', color: '#15120e',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  marginTop: 12,
};

export const ghostBtn = {
  padding: '6px 10px', borderRadius: 5, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--fg-muted)',
  fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
};

export function Dot({ a }) {
  return <span style={{ width: 16, height: 16, borderRadius: 8, background: a.accent, color: '#15120e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{a.letter}</span>;
}

export function Arrow() {
  return <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="var(--fg-muted)" strokeWidth="1.2" strokeLinecap="round"><path d="M1 4h10m-3-3l3 3-3 3"/></svg>;
}
