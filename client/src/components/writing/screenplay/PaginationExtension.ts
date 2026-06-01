import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { computePageBreaks, type PageBreakInput } from '../../../lib/scriptPagination'
import { normalizeElementType } from '../../../lib/screenplay'

// Continuous-scroll pagination decorations (Slice 1c).
//
// The deterministic layout paginator (lib/scriptPagination) is the source of
// truth for page count and page divisions. This plugin renders page-break and
// page-number widgets layered over the existing screenplay surface. It does NOT
// introduce hard page shells, fixed-height containers, or page recycling, and it
// never writes anything into the document — widget decorations are not part of
// editor.getHTML() output.

export const paginationPluginKey = new PluginKey<PaginationPluginState>('screenplayPagination')

const RECOMPUTE_DEBOUNCE_MS = 200

export interface PaginationOptions {
  onPageCountChange?: (count: number) => void
}

interface PaginationPluginState {
  decorations: DecorationSet
  pageCount: number
}

function collectParagraphs(doc: ProseMirrorNode): PageBreakInput[] {
  const items: PageBreakInput[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    items.push({
      pos: offset,
      type: normalizeElementType(node.attrs.elementType),
      text: node.textContent,
    })
  })
  return items
}

function renderPageBreak(pageNumber: number): HTMLElement {
  // Inline-safe element: a <span> (styled display:block via CSS) is valid inside
  // a <p>, so a mid-block divider does not break paragraph DOM. A <div> here
  // would be invalid phrasing content and trigger reflow/parse issues.
  const wrap = document.createElement('span')
  wrap.className = 'screenplay-page-break'
  wrap.setAttribute('contenteditable', 'false')
  const number = document.createElement('span')
  number.className = 'screenplay-page-number'
  number.textContent = String(pageNumber)
  wrap.appendChild(number)
  return wrap
}

function buildPaginationState(doc: ProseMirrorNode): PaginationPluginState {
  const { pageCount, breaks } = computePageBreaks(collectParagraphs(doc))
  const decorations = breaks.map((mark) => {
    // Clean boundary: divider sits at the block position. Mid-block: step into
    // the paragraph (+1) and to the wrapped-line character offset.
    const widgetPos = mark.charOffset != null ? mark.pos + 1 + mark.charOffset : mark.pos
    return Decoration.widget(widgetPos, () => renderPageBreak(mark.pageNumber), {
      side: -1,
      key: `screenplay-page-break-${mark.pageNumber}`,
    })
  })
  return {
    decorations: DecorationSet.create(doc, decorations),
    pageCount,
  }
}

function createPaginationPlugin(options: PaginationOptions): Plugin<PaginationPluginState> {
  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init(_config, editorState: EditorState) {
        return buildPaginationState(editorState.doc)
      },
      apply(tr: Transaction, value: PaginationPluginState) {
        const meta = tr.getMeta(paginationPluginKey) as PaginationPluginState | undefined
        if (meta) return meta
        // Keep existing decorations aligned with the doc until the debounced
        // recompute lands; never recompute on selection-only transactions.
        if (tr.docChanged) {
          return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) }
        }
        return value
      },
    },
    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
    view(editorView: EditorView) {
      let frame = 0
      let timer: ReturnType<typeof setTimeout> | null = null
      let lastPageCount = paginationPluginKey.getState(editorView.state)?.pageCount ?? 1

      const cancel = () => {
        if (frame) cancelAnimationFrame(frame)
        if (timer) clearTimeout(timer)
        frame = 0
        timer = null
      }

      const recompute = () => {
        const next = buildPaginationState(editorView.state.doc)
        if (next.pageCount !== lastPageCount) {
          lastPageCount = next.pageCount
          options.onPageCountChange?.(next.pageCount)
        }
        editorView.dispatch(editorView.state.tr.setMeta(paginationPluginKey, next))
      }

      // Publish the initial page count once the view is live. Deferred a
      // microtask so it never fires a parent setState during React's render of
      // the editor component.
      queueMicrotask(() => options.onPageCountChange?.(lastPageCount))

      return {
        update(view: EditorView, prevState: EditorState) {
          // Selection-only transactions leave the doc unchanged: skip recompute.
          if (view.state.doc.eq(prevState.doc)) return
          // Coalesce rapid keystrokes into a single recompute behind rAF + debounce.
          cancel()
          frame = requestAnimationFrame(() => {
            frame = 0
            timer = setTimeout(recompute, RECOMPUTE_DEBOUNCE_MS)
          })
        },
        destroy() {
          cancel()
        },
      }
    },
  })
}

export const PaginationExtension = Extension.create<PaginationOptions>({
  name: 'screenplayPagination',

  addOptions() {
    return {
      onPageCountChange: undefined,
    }
  },

  addProseMirrorPlugins() {
    return [createPaginationPlugin(this.options)]
  },
})
