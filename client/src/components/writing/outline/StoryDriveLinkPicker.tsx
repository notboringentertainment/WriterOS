import React, { useState } from 'react'
import type { StoryDriveCanonResult, StoryDriveFolder } from '@shared/projectLibraryApi'

export interface StoryDriveLinkResult {
  folderName: string
  canon: StoryDriveCanonResult
  morganOpen: boolean
}

export interface StoryDriveLinking {
  folders(): Promise<{ searchRoot: string; folders: StoryDriveFolder[] }>
  /** Resolves null when the writer switched projects while linking. */
  link(folder: string): Promise<StoryDriveLinkResult | null>
  importCanon(): Promise<StoryDriveCanonResult>
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The folder whose name matches the project title, ignoring case and punctuation. */
function preselect(folders: StoryDriveFolder[], projectTitle: string): string | null {
  const wanted = normalize(projectTitle)
  if (!wanted) return null
  return folders.find(folder => !folder.linkedTo && normalize(folder.name) === wanted)?.id ?? null
}

interface PickerProps {
  linking: StoryDriveLinking
  projectTitle: string
  onLinked(result: StoryDriveLinkResult): void
}

export function StoryDriveLinkPicker({ linking, projectTitle, onLinked }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [linkingNow, setLinkingNow] = useState(false)
  const [searchRoot, setSearchRoot] = useState('')
  const [folders, setFolders] = useState<StoryDriveFolder[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openPicker() {
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const found = await linking.folders()
      setSearchRoot(found.searchRoot)
      setFolders(found.folders)
      setSelected(preselect(found.folders, projectTitle))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "WriterOS couldn't list the Story-drive folders.")
    } finally {
      setLoading(false)
    }
  }

  async function link() {
    if (!selected) return
    setLinkingNow(true)
    setError(null)
    try {
      const result = await linking.link(selected)
      if (result) onLinked(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "WriterOS couldn't link the Story-drive folder.")
    } finally {
      setLinkingNow(false)
    }
  }

  if (!open) {
    return (
      <button type="button" style={styles.button} onClick={() => void openPicker()}>
        Link to Story-drive
      </button>
    )
  }

  return (
    <div style={styles.panel} aria-label="Link to Story-drive">
      {loading && <p style={styles.text}>Looking for Story-drive projects…</p>}
      {!loading && folders.length === 0 && !error && (
        <p style={styles.text}>
          WriterOS found no Story-drive projects in {searchRoot || 'the Story-drive folder'}. A project shows up here
          once its folder has a wayfinder folder with tickets in it.
        </p>
      )}
      {!loading && folders.length > 0 && (
        <>
          <p style={styles.text}>Which Story-drive project is this?</p>
          <div role="radiogroup" style={styles.list}>
            {folders.map(folder => (
              <label key={folder.id} style={{ ...styles.option, ...(folder.linkedTo ? styles.optionDisabled : {}) }}>
                <input
                  type="radio"
                  name="story-drive-folder"
                  value={folder.id}
                  checked={selected === folder.id}
                  disabled={Boolean(folder.linkedTo) || linkingNow}
                  onChange={() => setSelected(folder.id)}
                />
                <span>{folder.name}</span>
                {folder.linkedTo && <span style={styles.note}>linked to {folder.linkedTo.title}</span>}
              </label>
            ))}
          </div>
          <p style={styles.text}>Linking brings this folder's Story-drive decisions into WriterOS canon.</p>
        </>
      )}
      {error && <p role="alert" style={styles.error}>{error}</p>}
      <div style={styles.actions}>
        {folders.length > 0 && (
          <button
            type="button"
            style={{ ...styles.button, ...(!selected || linkingNow ? styles.buttonDisabled : {}) }}
            disabled={!selected || linkingNow}
            onClick={() => void link()}
          >
            {linkingNow ? 'Linking…' : 'Link'}
          </button>
        )}
        <button type="button" style={styles.button} disabled={linkingNow} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

interface NoticeProps {
  result: StoryDriveLinkResult
  onRetryCanon(): Promise<StoryDriveCanonResult>
}

/** What linking did, shown after the link is made. */
export function StoryDriveLinkNotice({ result, onRetryCanon }: NoticeProps) {
  const [canon, setCanon] = useState(result.canon)
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setRetrying(true)
    try {
      setCanon(await onRetryCanon())
    } catch (failure) {
      setCanon({ status: 'failed', message: failure instanceof Error ? failure.message : "WriterOS couldn't bring in the Story-drive canon." })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div style={styles.panel} role="status">
      <p style={styles.text}>
        Linked to Story-drive folder {result.folderName}.
        {canon.status === 'imported' && ' Its Story-drive decisions are now in WriterOS canon.'}
      </p>
      {canon.status === 'failed' && (
        <div style={styles.actions}>
          <p style={styles.error}>{canon.message}</p>
          <button
            type="button"
            style={{ ...styles.button, ...(retrying ? styles.buttonDisabled : {}) }}
            disabled={retrying}
            onClick={() => void retry()}
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        </div>
      )}
      {result.morganOpen && (
        <p style={styles.text}>
          Morgan is open on this project. Click New conversation in her panel so she works from the Story-drive folder.
        </p>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    padding: '12px 14px',
    margin: '16px 0',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  text: { fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', margin: 0 },
  note: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-muted)' },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  option: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg)', cursor: 'pointer' },
  optionDisabled: { color: 'var(--fg-muted)', cursor: 'not-allowed' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  buttonDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  error: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--danger, #b3261e)', margin: 0 },
}
