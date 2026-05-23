import React, { useMemo, useState } from 'react'
import type { ProjectSummary } from '../../lib/projectLibrary'
import { getDisplayProjectTitle } from '../../lib/projectIdentity'

interface HomeSurfaceProps {
  activeProjectId: string
  projects: ProjectSummary[]
  onOpenProject: (projectId: string) => void
  onNewProject: () => void
}

type SortKey = 'updated' | 'title' | 'created'

export function HomeSurface({
  activeProjectId,
  projects,
  onOpenProject,
  onNewProject,
}: HomeSurfaceProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const activeProject = projects.find(project => project.id === activeProjectId) ?? projects[0]

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = normalizedQuery.length === 0
      ? projects
      : projects.filter(project =>
          getDisplayProjectTitle(project.title).toLowerCase().includes(normalizedQuery)
        )

    return filtered.slice().sort((a, b) => {
      if (sortKey === 'title') {
        return getDisplayProjectTitle(a.title).localeCompare(getDisplayProjectTitle(b.title))
      }
      if (sortKey === 'created') return b.createdAt - a.createdAt
      return b.updatedAt - a.updatedAt
    })
  }, [projects, query, sortKey])

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
          <strong style={styles.statusValue}>Browser fallback</strong>
          <span style={styles.statusMeta}>Current prototype source</span>
        </div>
        <div style={styles.statusBlock}>
          <span style={styles.statusLabel}>Project folder</span>
          <strong style={styles.statusValue}>Not connected</strong>
          <span style={styles.statusMeta}>Target: ~/WriterOS Projects</span>
        </div>
        <div style={styles.statusBlock}>
          <span style={styles.statusLabel}>Projects</span>
          <strong style={styles.statusValue}>{projects.length}</strong>
          <span style={styles.statusMeta}>Saved in this browser</span>
        </div>
      </div>

      {activeProject && (
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
          <p style={styles.empty}>No projects match that filter.</p>
        ) : visibleProjects.map(project => {
          const isActive = project.id === activeProjectId
          return (
            <article key={project.id} style={{ ...styles.projectRow, ...(isActive ? styles.projectRowActive : {}) }}>
              <div style={styles.projectMain}>
                <h3 style={styles.projectTitle}>{getDisplayProjectTitle(project.title)}</h3>
                <p style={styles.projectMeta}>
                  {formatFormat(project.format)} · {formatSceneCount(project.sceneCount)} · Updated {formatTimestamp(project.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                style={isActive ? styles.primarySmallButton : styles.secondarySmallButton}
                aria-label={`Open ${getDisplayProjectTitle(project.title)}`}
                onClick={() => onOpenProject(project.id)}
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
