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
  const interactive = status.kind === 'scanned'

  return (
    <aside aria-label="Script Facts" style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Script Facts</h2>
        </div>
        <button
          type="button"
          aria-label={status.actionLabel}
          aria-pressed={interactive}
          title={status.actionLabel}
          style={{
            ...styles.scanToggle,
            ...(status.kind === 'scanned' ? styles.scanToggleScanned : {}),
            ...(status.kind === 'needs-scan' ? styles.scanToggleNeeded : {}),
          }}
          onClick={onRebuild}
        >
          <span aria-hidden="true" style={styles.scanToggleDot} />
          {status.buttonLabel}
        </button>
      </div>

      {facts.rebuiltAt && (
        <div style={styles.rebuiltAt}>Scanned {formatTimestamp(facts.rebuiltAt)}</div>
      )}

      {!interactive && (
        <div style={styles.navHint}>{status.hint}</div>
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
                    aria-label={`Step through ${warning.labels[0]} and ${warning.labels[1]}`}
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
  switch (warning.reason) {
    case 'edit-distance':
      return 'possible typo'
    case 'token-containment':
      return 'one name contains the other'
    default: {
      const _exhaustive: never = warning.reason
      return _exhaustive
    }
  }
}

function statusForFacts(facts: ScriptFactsCache, currentContentHash: string) {
  if (!facts.rebuiltAt) {
    return {
      kind: 'not-scanned' as const,
      buttonLabel: 'Not scanned',
      actionLabel: 'Scan current script for Script Facts',
      hint: 'Scan to navigate',
    }
  }

  return facts.contentHash === currentContentHash
    ? {
        kind: 'scanned' as const,
        buttonLabel: 'Scanned',
        actionLabel: 'Script Facts scanned; scan again',
        hint: '',
      }
    : {
        kind: 'needs-scan' as const,
        buttonLabel: 'Needs scan',
        actionLabel: 'Script changed; scan Script Facts again',
        hint: 'Script changed. Scan again to navigate',
      }
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
                  title={`Find ${entry.label} in script`}
                  onClick={() => onNavigate(section, entry.label)}
                >
                  {entry.label}
                  <span aria-hidden="true" style={styles.factButtonIcon}>&gt;</span>
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
  scanToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px 3px 7px',
    cursor: 'pointer',
  },
  scanToggleScanned: {
    borderColor: 'var(--accent, #2f8f5b)',
    color: 'var(--accent, #2f8f5b)',
  },
  scanToggleNeeded: {
    borderColor: 'var(--danger, #b45309)',
    color: 'var(--danger, #b45309)',
  },
  scanToggleDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: 'currentColor',
    flexShrink: 0,
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'left',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '3px 6px',
    margin: 0,
    cursor: 'pointer',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    lineHeight: 1.35,
  },
  factButtonIcon: {
    flexShrink: 0,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
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
