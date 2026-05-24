import React, { useMemo, useState } from 'react'
import type { ProjectSummary } from '../../lib/projectLibrary'
import { getDisplayProjectTitle } from '../../lib/projectIdentity'
import type {
  WriterOSCorruptFolderProject,
  WriterOSFolderProject,
  WriterOSProjectsFolderStatus,
} from '../../lib/useWriterOSProjectsFolder'

interface HomeSurfaceProps {
  activeProjectId: string
  projects: ProjectSummary[]
  folderProjects?: WriterOSFolderProject[]
  corruptFolderProjects?: WriterOSCorruptFolderProject[]
  storageStatus?: HomeProjectStorageStatus
  onOpenProject: (projectId: string) => void
  onNewProject: () => void
  onChooseProjectFolder?: () => void
  onRefreshProjectFolder?: () => void
  onForgetProjectFolder?: () => void
}

type SortKey = 'updated' | 'title' | 'created'
type HomeStorageStatusKind = WriterOSProjectsFolderStatus | 'browser-fallback'

interface HomeProjectStorageStatus {
  status: HomeStorageStatusKind
  label: string | null
  defaultFolderLabel: string
  fileSystemAccessSupported: boolean
  folderPersistenceSupported: boolean
  errorMessage: string | null
}

type HomeProjectRow =
  | {
      storageKind: 'browser'
      project: ProjectSummary
    }
  | {
      storageKind: 'folder'
      project: ProjectSummary
      packageName: string
      warnings: string[]
    }

export function HomeSurface({
  activeProjectId,
  projects,
  folderProjects = [],
  corruptFolderProjects = [],
  storageStatus,
  onOpenProject,
  onNewProject,
  onChooseProjectFolder,
  onRefreshProjectFolder,
  onForgetProjectFolder,
}: HomeSurfaceProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const storage = storageStatus ?? {
    status: 'browser-fallback' as const,
    label: null,
    defaultFolderLabel: '~/WriterOS Projects',
    fileSystemAccessSupported: false,
    folderPersistenceSupported: false,
    errorMessage: null,
  }
  const isFolderSelected = Boolean(storage.label) && storage.status !== 'disconnected' && storage.status !== 'unsupported'
  const showingFolderProjects = isFolderSelected && storage.status !== 'browser-fallback'
  const activeProject = projects.find(project => project.id === activeProjectId) ?? projects[0]

  const projectRows = useMemo<HomeProjectRow[]>(() => {
    if (showingFolderProjects) {
      return folderProjects.map(folderProject => ({
        storageKind: 'folder',
        project: folderProject.summary,
        packageName: folderProject.packageName,
        warnings: folderProject.warnings,
      }))
    }

    return projects.map(project => ({
      storageKind: 'browser',
      project,
    }))
  }, [folderProjects, projects, showingFolderProjects])

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = normalizedQuery.length === 0
      ? projectRows
      : projectRows.filter(row =>
          getDisplayProjectTitle(row.project.title).toLowerCase().includes(normalizedQuery)
          || (row.storageKind === 'folder' && row.packageName.toLowerCase().includes(normalizedQuery))
        )

    return filtered.slice().sort((a, b) => {
      if (sortKey === 'title') {
        return getDisplayProjectTitle(a.project.title).localeCompare(getDisplayProjectTitle(b.project.title))
      }
      if (sortKey === 'created') return b.project.createdAt - a.project.createdAt
      return b.project.updatedAt - a.project.updatedAt
    })
  }, [projectRows, query, sortKey])

  const folderActionLabel = storage.status === 'permission-needed'
    ? 'Reconnect Folder'
    : storage.label
      ? 'Change Folder'
      : 'Choose Folder'
  const projectFolderAction = storage.status === 'permission-needed'
    ? onRefreshProjectFolder
    : onChooseProjectFolder
  const canUseFolderActions = storage.fileSystemAccessSupported && projectFolderAction
  const projectCount = showingFolderProjects ? folderProjects.length : projects.length
  const projectCountMeta = showingFolderProjects
    ? `Discovered in ${storage.label ?? storage.defaultFolderLabel}`
    : 'Saved in this browser'

  return (
    <section style={styles.root} aria-labelledby="home-heading">
      <div style={styles.header}>
        <div>
          <p style={styles.kicker}>Home</p>
          <h1 id="home-heading" style={styles.title}>Projects</h1>
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={onNewProject}>
            New Project
          </button>
          {canUseFolderActions && (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={projectFolderAction}
            >
              {folderActionLabel}
            </button>
          )}
          <button
            type="button"
            style={styles.secondaryButton}
            disabled
            title="Final Draft import is planned for the next implementation slice."
          >
            Import .fdx
          </button>
        </div>
      </div>

      <div style={styles.statusGrid} aria-label="Storage status">
        <div style={styles.statusBlock}>
          <span style={styles.statusLabel}>Storage</span>
          <strong style={styles.statusValue}>{formatStorageStatus(storage.status)}</strong>
          <span style={styles.statusMeta}>{formatStorageStatusMeta(storage)}</span>
        </div>
        <div style={styles.statusBlock}>
          <span style={styles.statusLabel}>Project folder</span>
          <strong style={styles.statusValue}>{storage.label ?? 'Not connected'}</strong>
          <span style={styles.statusMeta}>Target: {storage.defaultFolderLabel}</span>
          {storage.fileSystemAccessSupported ? (
            <div style={styles.statusActions}>
              <button
                type="button"
                style={styles.statusButton}
                onClick={projectFolderAction}
                disabled={!projectFolderAction}
              >
                {folderActionLabel}
              </button>
              {storage.label && onRefreshProjectFolder && storage.status !== 'permission-needed' && (
                <button type="button" style={styles.statusButton} onClick={onRefreshProjectFolder}>
                  Refresh
                </button>
              )}
              {storage.label && onForgetProjectFolder && (
                <button type="button" style={styles.statusButton} onClick={onForgetProjectFolder}>
                  Forget
                </button>
              )}
            </div>
          ) : (
            <span style={styles.statusMeta}>Folder access is unavailable in this browser.</span>
          )}
        </div>
        <div style={styles.statusBlock}>
          <span style={styles.statusLabel}>Projects</span>
          <strong style={styles.statusValue}>{projectCount}</strong>
          <span style={styles.statusMeta}>{projectCountMeta}</span>
        </div>
        <div style={styles.statusBlock}>
          <span style={styles.statusLabel}>Local projects</span>
          <strong style={styles.statusValue}>{projects.length}</strong>
          <span style={styles.statusMeta}>
            {showingFolderProjects ? 'Available for future migration' : 'Current project source'}
          </span>
        </div>
      </div>

      {storage.errorMessage && (
        <div style={styles.notice} role="status">
          {storage.errorMessage}
        </div>
      )}

      {corruptFolderProjects.length > 0 && showingFolderProjects && (
        <div style={styles.notice} aria-label="Project package warnings">
          <strong style={styles.noticeTitle}>{corruptFolderProjects.length} project package needs attention</strong>
          {corruptFolderProjects.map(project => (
            <span key={project.packageName} style={styles.noticeLine}>
              {project.packageName}: {project.message}
            </span>
          ))}
        </div>
      )}

      {activeProject && !showingFolderProjects && (
        <div style={styles.currentProject}>
          <div>
            <span style={styles.statusLabel}>Current project</span>
            <h2 style={styles.currentTitle}>{getDisplayProjectTitle(activeProject.title)}</h2>
            <p style={styles.currentMeta}>
              {formatFormat(activeProject.format)} · {formatSceneCount(activeProject.sceneCount)} · Updated {formatTimestamp(activeProject.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => onOpenProject(activeProject.id)}
          >
            Open Current
          </button>
        </div>
      )}

      <div style={styles.toolbar}>
        <label style={styles.searchLabel}>
          <span style={styles.statusLabel}>Filter</span>
          <input
            aria-label="Filter projects"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Project title"
            style={styles.searchInput}
          />
        </label>
        <label style={styles.sortLabel}>
          <span style={styles.statusLabel}>Sort</span>
          <select
            aria-label="Sort projects"
            value={sortKey}
            onChange={event => setSortKey(event.target.value as SortKey)}
            style={styles.sortSelect}
          >
            <option value="updated">Last updated</option>
            <option value="title">Title</option>
            <option value="created">Created</option>
          </select>
        </label>
      </div>

      <div style={styles.projectList} aria-label="Project list">
        {visibleProjects.length === 0 ? (
          <p style={styles.empty}>{formatEmptyState(query, showingFolderProjects, storage.status)}</p>
        ) : visibleProjects.map(row => {
          const isActive = row.storageKind === 'browser' && row.project.id === activeProjectId
          const projectTitle = getDisplayProjectTitle(row.project.title)
          return (
            <article
              key={`${row.storageKind}-${row.project.id}`}
              style={{ ...styles.projectRow, ...(isActive ? styles.projectRowActive : {}) }}
            >
              <div style={styles.projectMain}>
                <h3 style={styles.projectTitle}>{projectTitle}</h3>
                <p style={styles.projectMeta}>
                  {formatFormat(row.project.format)} · {formatSceneCount(row.project.sceneCount)} · Updated {formatTimestamp(row.project.updatedAt)}
                </p>
                {row.storageKind === 'folder' && (
                  <p style={styles.projectPackageMeta}>
                    {row.packageName}
                    {row.warnings.length > 0 ? ` · ${row.warnings.length} warning${row.warnings.length === 1 ? '' : 's'}` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                style={isActive ? styles.primarySmallButton : styles.secondarySmallButton}
                aria-label={`Open ${projectTitle}`}
                disabled={row.storageKind === 'folder'}
                title={row.storageKind === 'folder' ? 'Opening file-backed projects is planned for the next storage slice.' : undefined}
                onClick={() => {
                  if (row.storageKind === 'browser') onOpenProject(row.project.id)
                }}
              >
                Open
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function formatStorageStatus(status: HomeStorageStatusKind) {
  switch (status) {
    case 'ready':
      return 'External folder'
    case 'loading':
      return 'Checking folder'
    case 'permission-needed':
      return 'Permission needed'
    case 'error':
      return 'Folder error'
    case 'unsupported':
      return 'Browser fallback'
    case 'disconnected':
    case 'browser-fallback':
      return 'Browser fallback'
  }
}

function formatStorageStatusMeta(storage: HomeProjectStorageStatus) {
  switch (storage.status) {
    case 'ready':
      return storage.folderPersistenceSupported
        ? 'Selected folder is remembered for this browser'
        : 'Selected folder is active for this session'
    case 'loading':
      return 'Scanning WriterOS project packages'
    case 'permission-needed':
      return 'Reconnect the selected folder to scan projects'
    case 'error':
      return 'Choose or refresh a project folder'
    case 'unsupported':
      return 'External folder access is unavailable'
    case 'disconnected':
      return 'Choose a WriterOS Projects folder'
    case 'browser-fallback':
      return 'Current prototype source'
  }
}

function formatFormat(format: ProjectSummary['format']) {
  return format === 'series' ? 'Series' : 'Feature'
}

function formatSceneCount(sceneCount: ProjectSummary['sceneCount']) {
  if (!sceneCount) return 'No scenes'
  return sceneCount === 1 ? '1 scene' : `${sceneCount} scenes`
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatEmptyState(
  query: string,
  showingFolderProjects: boolean,
  storageStatus: HomeStorageStatusKind,
) {
  if (query.trim()) return 'No projects match that filter.'
  if (!showingFolderProjects) return 'No projects match that filter.'
  if (storageStatus === 'loading') return 'Scanning project folder...'
  if (storageStatus === 'permission-needed') return 'Reconnect the project folder to show projects.'
  return 'No .writeros projects found in this folder.'
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100%',
    padding: '40px 48px 64px',
    background: 'var(--bg)',
    color: 'var(--fg)',
  },
  header: {
    maxWidth: 1080,
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 24,
  },
  kicker: {
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 34,
    fontWeight: 500,
    color: 'var(--fg)',
    marginTop: 4,
  },
  actions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
  statusGrid: {
    maxWidth: 1080,
    margin: '0 auto 18px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  statusBlock: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface)',
    padding: 16,
  },
  statusActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusButton: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '6px 9px',
  },
  statusLabel: {
    display: 'block',
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  statusValue: {
    display: 'block',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 500,
    marginTop: 4,
  },
  statusMeta: {
    display: 'block',
    color: 'var(--fg-muted)',
    fontSize: 13,
    marginTop: 4,
  },
  notice: {
    maxWidth: 1080,
    margin: '0 auto 18px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontSize: 14,
    padding: '12px 14px',
  },
  noticeTitle: {
    display: 'block',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    marginBottom: 4,
  },
  noticeLine: {
    display: 'block',
    marginTop: 3,
  },
  currentProject: {
    maxWidth: 1080,
    margin: '0 auto 28px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface-2)',
    padding: 18,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 18,
    alignItems: 'center',
  },
  currentTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 23,
    fontWeight: 500,
    color: 'var(--fg)',
    marginTop: 4,
  },
  currentMeta: {
    color: 'var(--fg-muted)',
    fontSize: 14,
    marginTop: 4,
  },
  toolbar: {
    maxWidth: 1080,
    margin: '0 auto 10px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  searchLabel: {
    flex: '1 1 260px',
  },
  sortLabel: {
    flex: '0 0 180px',
  },
  searchInput: {
    width: '100%',
    marginTop: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    padding: '9px 10px',
    outline: 'none',
  },
  sortSelect: {
    width: '100%',
    marginTop: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    padding: '9px 10px',
    outline: 'none',
  },
  projectList: {
    maxWidth: 1080,
    margin: '0 auto',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
  },
  projectRow: {
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '14px 0',
  },
  projectRowActive: {
    background: 'linear-gradient(90deg, hsla(260, 100%, 80%, 0.08), transparent)',
  },
  projectMain: {
    minWidth: 0,
    paddingLeft: 12,
  },
  projectTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 500,
    color: 'var(--fg)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectMeta: {
    color: 'var(--fg-muted)',
    fontSize: 13,
    marginTop: 4,
  },
  projectPackageMeta: {
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    marginTop: 5,
  },
  primarySmallButton: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--primary-dim)',
    borderRadius: 6,
    background: 'var(--primary-dim)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '7px 12px',
    marginRight: 12,
  },
  secondarySmallButton: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '7px 12px',
    marginRight: 12,
  },
  empty: {
    color: 'var(--fg-muted)',
    fontSize: 15,
    padding: '28px 12px',
  },
}
