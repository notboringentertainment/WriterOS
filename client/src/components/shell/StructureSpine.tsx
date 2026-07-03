import React from 'react'
import type { SurfaceStructure } from '../../lib/leftZone'

interface StructureSpineProps {
  structure: SurfaceStructure
}

/**
 * Surface Map — a static, glanceable map of the active surface's sections.
 * Display-only by design: non-interactive labels, no expand/collapse, no navigation. Renders
 * as plain (non-clickable) list items so it never implies an interactive outline/tree. Scrolls
 * within its region (the .zone-spine wrapper owns the overflow). Honest empty state when a
 * surface has no structure yet — never invents hierarchy.
 */
export function StructureSpine({ structure }: StructureSpineProps) {
  return (
    <div style={styles.root}>
      <div style={styles.heading}>{structure.heading}</div>

      {structure.empty ? (
        <p style={styles.empty}>{structure.emptyHint}</p>
      ) : (
        <ul style={styles.list}>
          {structure.nodes.map(node => (
            <li key={node.id} style={styles.node}>
              <span style={styles.label}>{node.label}</span>
              {node.detail && <span style={styles.detail}>{node.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '14px 16px',
  },
  heading: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--fg-subtle)',
    marginBottom: 8,
  },
  empty: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontStyle: 'italic',
    color: 'var(--fg-muted)',
    lineHeight: 1.5,
  },
  list: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  node: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    padding: '4px 0',
  },
  label: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detail: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--fg-subtle)',
    flexShrink: 0,
  },
}
