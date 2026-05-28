import React from 'react'
import { getDisplayProjectTitle } from '../../lib/projectIdentity'
import type { TitlePageMetadata } from '../../lib/projectState'
import type { ProjectFormat } from '@shared/projectFormat'

interface TitlePagePanelProps {
  projectTitle: string
  projectFormat: ProjectFormat
  titlePage: TitlePageMetadata
  onProjectTitleChange: (title: string) => void
  onTitlePageChange: (patch: Partial<TitlePageMetadata>) => void
  onClose: () => void
}

export function TitlePagePanel({
  projectTitle,
  projectFormat,
  titlePage,
  onProjectTitleChange,
  onTitlePageChange,
  onClose,
}: TitlePagePanelProps) {
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  const displayTitle = getDisplayProjectTitle(projectTitle)
  const formatDisplay = titlePage.formatDisplay.trim() || defaultFormatDisplay(projectFormat)

  React.useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  return (
    <div style={styles.overlay} role="presentation">
      <section
        aria-label="Title page"
        aria-modal="true"
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        style={styles.dialog}
      >
        <div style={styles.header}>
          <div>
            <h2 style={styles.heading}>Title page</h2>
            <p style={styles.subheading}>Metadata and preview</p>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={styles.content}>
          <div style={styles.formColumn}>
            <Field label="Title">
              <input
                aria-label="Title page title"
                ref={titleInputRef}
                value={projectTitle}
                onChange={event => onProjectTitleChange(event.target.value)}
                style={styles.input}
              />
            </Field>

            <Field label="Written by">
              <textarea
                aria-label="Written by"
                value={titlePage.writtenBy}
                onChange={event => onTitlePageChange({ writtenBy: event.target.value })}
                rows={3}
                style={{ ...styles.input, ...styles.textarea, minHeight: 74 }}
              />
            </Field>

            <Field label="Based on">
              <textarea
                aria-label="Based on"
                value={titlePage.basedOn}
                onChange={event => onTitlePageChange({ basedOn: event.target.value })}
                rows={3}
                style={{ ...styles.input, ...styles.textarea, minHeight: 74 }}
              />
            </Field>

            <Field label="Contact">
              <textarea
                aria-label="Contact info"
                value={titlePage.contactInfo}
                onChange={event => onTitlePageChange({ contactInfo: event.target.value })}
                rows={5}
                style={{ ...styles.input, ...styles.textarea }}
              />
            </Field>

            <div style={styles.twoColumn}>
              <Field label="Draft label">
                <input
                  aria-label="Draft label"
                  value={titlePage.draftLabel}
                  onChange={event => onTitlePageChange({ draftLabel: event.target.value })}
                  style={styles.input}
                />
              </Field>

              <Field label="Draft date">
                <input
                  aria-label="Draft date"
                  value={titlePage.draftDate}
                  onChange={event => onTitlePageChange({ draftDate: event.target.value })}
                  style={styles.input}
                />
              </Field>
            </div>

            <Field label="Format display">
              <input
                aria-label="Format display"
                value={titlePage.formatDisplay}
                placeholder={defaultFormatDisplay(projectFormat)}
                onChange={event => onTitlePageChange({ formatDisplay: event.target.value })}
                style={styles.input}
              />
            </Field>
          </div>

          <div style={styles.previewColumn}>
            <div style={styles.previewPage} aria-label="Title page preview">
              <div style={styles.previewCenter}>
                <h1 style={styles.previewTitle}>{displayTitle.toUpperCase()}</h1>
                {titlePage.writtenBy.trim() && (
                  <p style={styles.previewByline}>Written by<br />{titlePage.writtenBy.trim()}</p>
                )}
                {titlePage.basedOn.trim() && (
                  <p style={styles.previewBasedOn}>Based on {titlePage.basedOn.trim()}</p>
                )}
              </div>

              {formatDisplay && (
                <p style={styles.previewFormat}>{formatDisplay}</p>
              )}

              {(titlePage.draftLabel.trim() || titlePage.draftDate.trim()) && (
                <p style={styles.previewDraft}>
                  {[titlePage.draftLabel.trim(), titlePage.draftDate.trim()]
                    .filter(Boolean)
                    .join('\n')}
                </p>
              )}

              {titlePage.contactInfo.trim() && (
                <p style={styles.previewContact}>{titlePage.contactInfo.trim()}</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  )
}

function defaultFormatDisplay(format: ProjectFormat) {
  return format === 'series' ? 'Series' : 'Feature'
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 30,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    background: 'rgba(16, 13, 10, 0.36)',
    padding: '56px 24px 24px',
    overflow: 'auto',
  },
  dialog: {
    width: 920,
    maxWidth: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.24)',
    padding: 18,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 500,
    letterSpacing: 0,
  },
  subheading: {
    margin: '3px 0 0',
    color: 'var(--fg-subtle)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
  },
  closeButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '5px 10px',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 1fr) minmax(300px, 400px)',
    gap: 20,
    alignItems: 'start',
  },
  formColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    lineHeight: 1.4,
    padding: '8px 10px',
    outline: 'none',
  },
  textarea: {
    minHeight: 104,
    resize: 'vertical',
    whiteSpace: 'pre-wrap',
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  previewColumn: {
    display: 'flex',
    justifyContent: 'center',
  },
  previewPage: {
    position: 'relative',
    width: 360,
    aspectRatio: '8.5 / 11',
    background: '#fff',
    color: '#111',
    border: '1px solid var(--border)',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.16)',
    fontFamily: 'Courier New, Courier, monospace',
    fontSize: 12,
    overflow: 'hidden',
  },
  previewCenter: {
    position: 'absolute',
    top: '34%',
    left: 42,
    right: 42,
    transform: 'translateY(-50%)',
    textAlign: 'center',
  },
  previewTitle: {
    margin: '0 0 28px',
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: 0,
  },
  previewByline: {
    margin: 0,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
  previewBasedOn: {
    margin: '26px 0 0',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
  previewFormat: {
    position: 'absolute',
    top: 32,
    right: 42,
    margin: 0,
    color: '#444',
  },
  previewDraft: {
    position: 'absolute',
    right: 42,
    bottom: 54,
    margin: 0,
    lineHeight: 1.35,
    textAlign: 'right',
    whiteSpace: 'pre-wrap',
  },
  previewContact: {
    position: 'absolute',
    left: 42,
    bottom: 54,
    maxWidth: 190,
    margin: 0,
    lineHeight: 1.35,
    whiteSpace: 'pre-wrap',
  },
}
