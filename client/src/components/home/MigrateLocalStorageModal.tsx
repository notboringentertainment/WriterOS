import React from 'react'

export interface MigrateLocalStorageProjectSummary {
  id: string
  title: string
}

export interface MigrateLocalStorageModalProps {
  open: boolean
  projects: MigrateLocalStorageProjectSummary[]
  folderLabel: string
  onMigrate: () => void
  onCancel: () => void
  migrating: boolean
}

export function MigrateLocalStorageModal({
  open,
  projects,
  folderLabel,
  onMigrate,
  onCancel,
  migrating,
}: MigrateLocalStorageModalProps) {
  if (!open) return null

  const count = projects.length
  const projectWord = count === 1 ? 'project' : 'projects'
  const migrateButtonLabel = migrating ? 'Migrating…' : `Migrate ${count} ${projectWord}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="migrate-local-storage-title"
      style={styles.modalBackdrop}
    >
      <div style={styles.modalCard}>
        <h2 id="migrate-local-storage-title" style={styles.modalTitle}>
          Migrate {count} browser {projectWord} to {folderLabel}
        </h2>
        <p style={styles.modalBody}>
          WriterOS found {count} {projectWord} stored in this browser.
          Copy {count === 1 ? 'it' : 'them'} into <strong>{folderLabel}</strong> so they live as{' '}
          <code>.writeros</code> folders you can back up and reopen.
        </p>
        <p style={styles.modalBody}>
          The browser copies stay as a safety backup and stop appearing in the active list.
        </p>
        <ul style={styles.projectList} aria-label="Projects to migrate">
          {projects.map(project => (
            <li key={project.id} style={styles.projectItem}>{project.title}</li>
          ))}
        </ul>
        <div style={styles.modalActions}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={onCancel}
            disabled={migrating}
          >
            Cancel
          </button>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={onMigrate}
            disabled={migrating}
          >
            {migrateButtonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'hsla(220, 20%, 5%, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 50,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 24,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 500,
    color: 'var(--fg)',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: 'var(--fg-muted)',
    lineHeight: 1.5,
    marginBottom: 10,
  },
  projectList: {
    margin: '8px 0 4px',
    paddingLeft: 20,
    maxHeight: 180,
    overflowY: 'auto',
    color: 'var(--fg)',
    fontSize: 14,
  },
  projectItem: {
    marginTop: 4,
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    padding: '9px 14px',
  },
  primaryButton: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--primary-dim)',
    borderRadius: 6,
    background: 'var(--primary-dim)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    padding: '9px 14px',
  },
}
