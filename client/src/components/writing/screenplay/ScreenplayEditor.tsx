import React, { useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import { ScreenplayExtension } from './ScreenplayExtension'
import { ElementType, countWords } from '../../../lib/screenplay'
import './screenplay.css'

interface ScreenplayEditorProps {
  onWordCountChange?: (count: number) => void
  onPageCountChange?: (count: number) => void
  onElementTypeChange?: (type: ElementType) => void
  onSceneHeadingsChange?: (headings: Array<{ index: number; text: string; nodePos: number }>) => void
}

export function ScreenplayEditor({
  onWordCountChange,
  onPageCountChange,
  onElementTypeChange,
  onSceneHeadingsChange,
}: ScreenplayEditorProps) {
  const editorDivRef = useRef<HTMLDivElement>(null)

  const updatePageCount = useCallback(() => {
    if (!editorDivRef.current) return
    const pageHeightPx = 11 * 96
    const pages = Math.max(1, Math.round(editorDivRef.current.scrollHeight / pageHeightPx))
    onPageCountChange?.(pages)
  }, [onPageCountChange])

  const editor = useEditor({
    extensions: [Document, Paragraph, Text, History, ScreenplayExtension],
    content: '<p data-element-type="scene-heading"></p>',

    onUpdate: ({ editor }) => {
      onWordCountChange?.(countWords(editor.getText()))

      updatePageCount()

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

    onSelectionUpdate: ({ editor }) => {
      const { $anchor } = editor.state.selection
      const node = $anchor.parent
      if (node.type.name === 'paragraph') {
        onElementTypeChange?.((node.attrs.elementType as ElementType) ?? 'action')
      }
    },
  })

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
