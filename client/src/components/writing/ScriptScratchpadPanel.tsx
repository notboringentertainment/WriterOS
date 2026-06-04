import React, { useCallback, useEffect, useRef } from 'react'
import type {
  ScratchpadItem,
  ScratchpadItemType,
  ScratchpadPinnedScene,
  ScratchpadState,
} from '../../lib/scriptScratchpad'

interface ScriptScratchpadPanelProps {
  scratchpad: ScratchpadState
  canPin: boolean
  onAddItem: (type: ScratchpadItemType) => void
  onChangeItemText: (id: string, text: string) => void
  onChangeItemType: (id: string, type: ScratchpadItemType) => void
  onToggleItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onPinItem: (id: string) => void
  onUnpinItem: (id: string) => void
  onGoToPinnedScene?: (scene: ScratchpadPinnedScene) => void
}

const TYPE_LABEL: Record<ScratchpadItemType, string> = {
  text: 'Note',
  bullet: 'Bullet',
  task: 'Task',
}

const TYPE_CYCLE: Record<ScratchpadItemType, ScratchpadItemType> = {
  text: 'bullet',
  bullet: 'task',
  task: 'text',
}

export function ScriptScratchpadPanel({
  scratchpad,
  canPin,
  onAddItem,
  onChangeItemText,
  onChangeItemType,
  onToggleItem,
  onRemoveItem,
  onPinItem,
  onUnpinItem,
  onGoToPinnedScene,
}: ScriptScratchpadPanelProps) {
  const pendingAddScrollRef = useRef(false)
  const previousItemIdsRef = useRef(new Set(scratchpad.items.map(item => item.id)))
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>())

  const handleAddItem = useCallback((type: ScratchpadItemType) => {
    pendingAddScrollRef.current = true
    onAddItem(type)
  }, [onAddItem])

  const setItemRef = useCallback((id: string, node: HTMLLIElement | null) => {
    if (node) itemRefs.current.set(id, node)
    else itemRefs.current.delete(id)
  }, [])

  const setTextareaRef = useCallback((id: string, node: HTMLTextAreaElement | null) => {
    if (node) textareaRefs.current.set(id, node)
    else textareaRefs.current.delete(id)
  }, [])

  useEffect(() => {
    const previousItemIds = previousItemIdsRef.current
    const addedItem = scratchpad.items.find(item => !previousItemIds.has(item.id))
    previousItemIdsRef.current = new Set(scratchpad.items.map(item => item.id))

    if (!pendingAddScrollRef.current || !addedItem) return
    pendingAddScrollRef.current = false

    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)

    schedule(() => {
      const row = itemRefs.current.get(addedItem.id)
      const textarea = textareaRefs.current.get(addedItem.id)
      if (typeof row?.scrollIntoView === 'function') {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
      textarea?.focus()
    })
  }, [scratchpad.items])

  return (
    <aside aria-label="Script Scratchpad" style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Scratchpad</h2>
      </div>
      <p style={styles.hint}>Working notes. Never sent to the script or agents.</p>

      <div style={styles.addRow}>
        <button type="button" aria-label="Add note" style={styles.addButton} onClick={() => handleAddItem('text')}>
          + Note
        </button>
        <button type="button" aria-label="Add bullet" style={styles.addButton} onClick={() => handleAddItem('bullet')}>
          + Bullet
        </button>
        <button type="button" aria-label="Add task" style={styles.addButton} onClick={() => handleAddItem('task')}>
          + Task
        </button>
      </div>

      {scratchpad.items.length === 0 ? (
        <div style={styles.empty}>No notes yet</div>
      ) : (
        <ul style={styles.list}>
          {scratchpad.items.map((item, index) => (
            <ScratchpadItemRow
              key={item.id}
              item={item}
              index={index}
              itemRef={node => setItemRef(item.id, node)}
              textareaRef={node => setTextareaRef(item.id, node)}
              canPin={canPin}
              onChangeItemText={onChangeItemText}
              onChangeItemType={onChangeItemType}
              onToggleItem={onToggleItem}
              onRemoveItem={onRemoveItem}
              onPinItem={onPinItem}
              onUnpinItem={onUnpinItem}
              onGoToPinnedScene={onGoToPinnedScene}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}

function ScratchpadItemRow({
  item,
  index,
  itemRef,
  textareaRef,
  canPin,
  onChangeItemText,
  onChangeItemType,
  onToggleItem,
  onRemoveItem,
  onPinItem,
  onUnpinItem,
  onGoToPinnedScene,
}: {
  item: ScratchpadItem
  index: number
  itemRef: (node: HTMLLIElement | null) => void
  textareaRef: (node: HTMLTextAreaElement | null) => void
  canPin: boolean
  onChangeItemText: (id: string, text: string) => void
  onChangeItemType: (id: string, type: ScratchpadItemType) => void
  onToggleItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onPinItem: (id: string) => void
  onUnpinItem: (id: string) => void
  onGoToPinnedScene?: (scene: ScratchpadPinnedScene) => void
}) {
  const label = item.text.trim() || `item ${index + 1}`

  return (
    <li ref={itemRef} style={styles.item}>
      <div style={styles.itemBody}>
        {item.type === 'task' && (
          <input
            type="checkbox"
            checked={item.checked}
            aria-label={`Toggle ${label}`}
            style={styles.checkbox}
            onChange={() => onToggleItem(item.id)}
          />
        )}
        {item.type === 'bullet' && <span aria-hidden="true" style={styles.bullet}>•</span>}
        <textarea
          ref={textareaRef}
          aria-label={`Scratchpad note ${index + 1}`}
          rows={1}
          value={item.text}
          placeholder="Write a note…"
          style={{
            ...styles.textarea,
            ...(item.type === 'task' && item.checked ? styles.textareaChecked : {}),
          }}
          onChange={event => onChangeItemText(item.id, event.target.value)}
        />
      </div>

      <div style={styles.itemActions}>
        <button
          type="button"
          aria-label={`Change type for ${label}`}
          style={styles.actionButton}
          onClick={() => onChangeItemType(item.id, TYPE_CYCLE[item.type])}
        >
          {TYPE_LABEL[item.type]}
        </button>

        {item.pinnedScene ? (
          <>
            <button
              type="button"
              aria-label={`Go to ${item.pinnedScene.heading}`}
              style={styles.pinnedButton}
              onClick={() => item.pinnedScene && onGoToPinnedScene?.(item.pinnedScene)}
            >
              📌 {item.pinnedScene.heading || `Scene ${item.pinnedScene.index}`}
            </button>
            <button
              type="button"
              aria-label={`Unpin ${label}`}
              style={styles.actionButton}
              onClick={() => onUnpinItem(item.id)}
            >
              Unpin
            </button>
          </>
        ) : (
          canPin && (
            <button
              type="button"
              aria-label={`Pin ${label} to current scene`}
              style={styles.actionButton}
              onClick={() => onPinItem(item.id)}
            >
              Pin to scene
            </button>
          )
        )}

        <button
          type="button"
          aria-label={`Delete ${label}`}
          style={styles.actionButton}
          onClick={() => onRemoveItem(item.id)}
        >
          Delete
        </button>
      </div>
    </li>
  )
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
    marginBottom: 4,
  },
  title: {
    margin: 0,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  hint: {
    margin: '0 0 10px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    lineHeight: 1.4,
  },
  addRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  addButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 10,
  },
  item: {
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
    display: 'grid',
    gap: 6,
  },
  itemBody: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  },
  checkbox: {
    marginTop: 4,
    cursor: 'pointer',
    flexShrink: 0,
  },
  bullet: {
    marginTop: 2,
    color: 'var(--fg-subtle)',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: 'vertical',
    border: '1px solid transparent',
    borderRadius: 6,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    lineHeight: 1.4,
    padding: '4px 6px',
  },
  textareaChecked: {
    textDecoration: 'line-through',
    color: 'var(--fg-subtle)',
  },
  itemActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  actionButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: '2px 6px',
    cursor: 'pointer',
  },
  pinnedButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: '2px 6px',
    cursor: 'pointer',
    maxWidth: 150,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    color: 'var(--fg-subtle)',
    fontSize: 12,
  },
}
