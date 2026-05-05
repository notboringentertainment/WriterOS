type WritingTab = 'script' | 'story-bible' | 'outline' | 'synopsis'

const WRITING_TABS: { id: WritingTab; label: string }[] = [
  { id: 'script',      label: 'Script' },
  { id: 'story-bible', label: 'Story Bible' },
  { id: 'outline',     label: 'Outline' },
  { id: 'synopsis',    label: 'Synopsis' },
]

interface TopBarProps {
  activeTab: WritingTab
  writersRoomActive: boolean
  projectTitle: string
  onTabChange: (tab: WritingTab) => void
  onWritersRoom: () => void
}

export function TopBar({ activeTab, writersRoomActive, projectTitle, onTabChange, onWritersRoom }: TopBarProps) {
  return (
    <header style={styles.bar}>
      <div style={styles.logo}>
        <span style={styles.logoText}>WriterOS</span>
      </div>

      <nav role="tablist" style={styles.tabs}>
        {WRITING_TABS.map(tab => {
          const isActive = activeTab === tab.id && !writersRoomActive
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div style={styles.projectTitle}>{projectTitle}</div>

      <div style={styles.rightZone}>
        <button
          role="tab"
          aria-selected={writersRoomActive}
          style={{ ...styles.writersRoom, ...(writersRoomActive ? styles.writersRoomActive : {}) }}
          onClick={onWritersRoom}
        >
          Writer's Room
        </button>
        <button style={styles.cmdK} title="⌘K">⌘K</button>
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 'var(--topbar-height)' as string,
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 16px',
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  logo: { flexShrink: 0, marginRight: 8 },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    fontSize: 15,
    color: 'var(--fg)',
    letterSpacing: '-0.02em',
  },
  tabs: { display: 'flex', gap: 2 },
  tab: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 400,
    padding: '4px 12px',
    cursor: 'pointer',
    transition: 'color 120ms, border-color 120ms',
  },
  tabActive: {
    color: 'var(--fg)',
    borderColor: 'var(--border)',
    background: 'var(--surface-2)',
  },
  projectTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    pointerEvents: 'none',
  },
  rightZone: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  writersRoom: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '4px 12px',
    cursor: 'pointer',
  },
  writersRoomActive: {
    color: 'var(--primary)',
    borderColor: 'var(--primary-dim)',
    background: 'hsla(260, 100%, 80%, 0.08)',
  },
  cmdK: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
  },
}
