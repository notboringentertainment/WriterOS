import React, { useRef, useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import { ScreenplayExtension } from './ScreenplayExtension'
import { PaginationExtension } from './PaginationExtension'
import { ElementType, countWords } from '../../../lib/screenplay'
import type { ScriptFocusState } from '../../../lib/scriptIndex'
import './screenplay.css'

interface ScreenplayEditorProps {
  initialContent?: string
  onContentChange?: (html: string) => void
  onEditorReady?: (editor: Editor) => void
  onWordCountChange?: (count: number) => void
  onPageCountChange?: (count: number) => void
  onElementTypeChange?: (type: ElementType) => void
  onSceneHeadingsChange?: (headings: Array<{ index: number; text: string; nodePos: number }>) => void
  onContentSnapshotChange?: (snapshot: { html: string; focus?: ScriptFocusState }) => void
}

export function ScreenplayEditor({
  initialContent,
  onContentChange,
  onEditorReady,
  onWordCountChange,
  onPageCountChange,
  onElementTypeChange,
  onSceneHeadingsChange,
  onContentSnapshotChange,
}: ScreenplayEditorProps) {
  const editorDivRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable ref so the debounced callback always calls the latest prop value
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const onContentSnapshotChangeRef = useRef(onContentSnapshotChange)
  onContentSnapshotChangeRef.current = onContentSnapshotChange
  // Stable bridge for the pagination plugin's page-count callback.
  const onPageCountChangeRef = useRef(onPageCountChange)
  onPageCountChangeRef.current = onPageCountChange

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const publishEditorMetrics = useCallback(
    (editor: Editor) => {
      onWordCountChange?.(countWords(editor.getText()))

      const headings: Array<{ index: number; text: string; nodePos: number }> = []
      let sceneIndex = 0
      editor.state.doc.forEach((node, offset) => {
        if (
          node.type.name === 'paragraph' &&
          node.attrs.elementType === 'scene-heading'
        ) {
          headings.push({ index: sceneIndex + 1, text: node.textContent, nodePos: offset })
          sceneIndex++
        }
      })
      onSceneHeadingsChange?.(headings)
    },
    [onSceneHeadingsChange, onWordCountChange]
  )

  const getFocusState = useCallback((editor: Editor): ScriptFocusState | undefined => {
    const { selection } = editor.state
    const { $anchor } = selection
    const node = $anchor.parent
    if (node.type.name !== 'paragraph') return undefined

    const selectedText = selection.empty
      ? ''
      : editor.state.doc.textBetween(selection.from, selection.to, '\n').trim()

    return {
      blockIndex: $anchor.index(0),
      selectedText,
      updatedAt: Date.now(),
    }
  }, [])

  const publishContentSnapshot = useCallback((editor: Editor) => {
    onContentSnapshotChangeRef.current?.({
      html: editor.getHTML(),
      focus: getFocusState(editor),
    })
  }, [getFocusState])

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      History,
      ScreenplayExtension,
      // Layout-derived page count + continuous-scroll page-break/number
      // decorations. The page count flows through the stable ref so the
      // extension (created once) always reaches the latest prop.
      PaginationExtension.configure({
        onPageCountChange: (count: number) => onPageCountChangeRef.current?.(count),
      }),
    ],
    content: initialContent || '<p data-element-type="scene-heading"></p>',

    onCreate({ editor }) {
      onEditorReady?.(editor)
      publishContentSnapshot(editor)
    },

    onUpdate({ editor }) {
      publishEditorMetrics(editor)
      publishContentSnapshot(editor)

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onContentChangeRef.current?.(editor.getHTML())
      }, 500)
    },

    onSelectionUpdate({ editor }) {
      const { $anchor } = editor.state.selection
      const node = $anchor.parent
      if (node.type.name === 'paragraph') {
        onElementTypeChange?.((node.attrs.elementType as ElementType) ?? 'action')
        publishContentSnapshot(editor)
      }
    },
  })

  useEffect(() => {
    if (!editor) return

    const frame = requestAnimationFrame(() => {
      publishEditorMetrics(editor)
      publishContentSnapshot(editor)
    })

    return () => cancelAnimationFrame(frame)
  }, [editor, publishEditorMetrics])

  return (
    <div ref={editorDivRef} style={styles.page}>
      <EditorContent editor={editor} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: 816,
    minHeight: 1056,
    background: 'var(--script-page)',
    boxShadow: `
      0 0 0 1px hsla(38, 30%, 60%, 0.08),
      0 8px 48px hsla(38, 60%, 50%, 0.12),
      0 32px 96px hsla(38, 40%, 40%, 0.08)
    `,
    animation: 'script-appear 300ms ease-out',
    flexShrink: 0,
  },
}
