import React from 'react'
import type { ScriptFactEntry, ScriptFactSection, ScriptFactsCache, ScriptFactWarning } from '../../lib/scriptFacts'

interface ScriptFactsPanelProps {
  facts: ScriptFactsCache
  currentContentHash: string
  onRebuild: () => void
  onNavigateFact?: (section: ScriptFactSection, label: string) => void
  onStepWarning?: (warning: ScriptFactWarning) => void
}

export function ScriptFactsPanel({
  facts,
  currentContentHash,
  onRebuild,
  onNavigateFact,
  onStepWarning,
}: ScriptFactsPanelProps) {
  const status = statusForFacts(facts, currentContentHash)
  const interactive = status.label === 'Current'

  return (
    <aside aria-label="Script Facts" style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Script Facts</h2>
          <span style={{ ...styles.status, color: status.color }}>{status.label}</span>
        </div>
        <button
          type="button"
          aria-label="Rebuild Script Facts"
          style={styles.rebuildButton}
          onClick={onRebuild}
        >
          Rebuild
        </button>
      </div>

      {facts.rebuiltAt && (
        <div style={styles.rebuiltAt}>Rebuilt {formatTimestamp(facts.rebuiltAt)}</div>
      )}

      {!interactive && (
        <div style={styles.navHint}>Rebuild to navigate</div>
      )}

      {facts.warnings.length > 0 && (
        <section style={styles.section} aria-label="Script Facts warnings">
          <h3 style={styles.sectionTitle}>Warnings</h3>
          <ul style={styles.warningList}>
            {facts.warnings.map(warning => (
              <li key={warningKey(warning)} style={styles.warningItem}>
                <span>
                  {warning.labels[0]} / {warning.labels[1]} — {warningReason(warning)}
                </span>
                {interactive && onStepWarning && (
                  <button
                    type="button"
                    style={styles.stepButton}
                    onClick={() => onStepWarning(warning)}
                  >
                    Step through
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <FactSection title="Characters" section="characters" entries={facts.characters} interactive={interactive} onNavigate={onNavigateFact} />
      <FactSection title="Locations" section="locations" entries={facts.locations} interactive={interactive} onNavigate={onNavigateFact} />
      <FactSection title="Times" section="times" entries={facts.times} interactive={interactive} onNavigate={onNavigateFact} />
      <FactSection title="Transitions" section="transitions" entries={facts.transitions} interactive={interactive} onNavigate={onNavigateFact} />
    </aside>
  )
}

function warningReason(warning: ScriptFactWarning): string {
  return warning.reason === 'edit-distance' ? 'possible typo' : 'one name contains the other'
}

function statusForFacts(facts: ScriptFactsCache, currentContentHash: string) {
  if (!facts.rebuiltAt) {
    return { label: 'Not rebuilt', color: 'var(--fg-subtle)' }
  }

  return facts.contentHash === currentContentHash
    ? { label: 'Current', color: 'var(--accent, #2f8f5b)' }
    : { label: 'Stale', color: 'var(--danger, #b45309)' }
}

function FactSection({
  title,
  section,
  entries,
  interactive,
  onNavigate,
}: {
  title: string
  section: ScriptFactSection
  entries: ScriptFactEntry[]
  interactive: boolean
  onNavigate?: (section: ScriptFactSection, label: string) => void
}) {
  return (
    <section style={styles.section} aria-label={`Script Facts ${title}`}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {entries.length === 0 ? (
        <div style={styles.empty}>None</div>
      ) : (
        <ul style={styles.factList}>
          {entries.map(entry => (
            <li key={entry.label} style={styles.factItem}>
              {interactive && onNavigate ? (
                <button
                  type="button"
                  style={styles.factButton}
                  onClick={() => onNavigate(section, entry.label)}
                >
                  {entry.label}
                </button>
              ) : (
                <span style={styles.factLabel}>{entry.label}</span>
              )}
              <span style={styles.count}>{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function warningKey(warning: ScriptFactWarning): string {
  return `${warning.section}:${warning.labels.join('|')}:${warning.reason}`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 252,
    flexShrink: 0,
    alignSelf: 'flex-start',
    borderLeft: '1px solid var(--border)',
    padding: '4px 0 24px 16px',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  status: {
    display: 'block',
    marginTop: 3,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  rebuildButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
  },
  rebuiltAt: {
    marginBottom: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  section: {
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
    marginTop: 10,
  },
  sectionTitle: {
    margin: '0 0 6px',
    color: 'var(--fg)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  factList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 4,
  },
  factItem: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 12,
    lineHeight: 1.35,
  },
  factLabel: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    color: 'var(--fg-muted)',
  },
  count: {
    minWidth: 20,
    textAlign: 'right',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
  },
  warningList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 4,
  },
  warningItem: {
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--fg)',
    fontSize: 12,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  empty: {
    color: 'var(--fg-subtle)',
    fontSize: 12,
  },
  navHint: {
    marginBottom: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  factButton: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    lineHeight: 1.35,
  },
  stepButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: '2px 6px',
    cursor: 'pointer',
  },
}
