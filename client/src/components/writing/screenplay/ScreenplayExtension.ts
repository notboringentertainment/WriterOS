import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  ElementType,
  getTabNext,
  getTabPrev,
  getEnterNext,
  getScreenplaySpacingBefore,
  shouldSentenceCapitalize,
  shouldUppercase,
} from '../../../lib/screenplay'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    screenplay: {
      setElementType: (type: ElementType) => ReturnType
      uppercaseCurrentBlock: () => ReturnType
    }
  }
}

export const ScreenplayExtension = Extension.create({
  name: 'screenplay',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          elementType: {
            default: 'action' as ElementType,
            parseHTML: el =>
              (el.getAttribute('data-element-type') as ElementType) ?? 'action',
            renderHTML: attrs => ({
              'data-element-type': attrs.elementType as string,
            }),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setElementType:
        (type: ElementType) =>
        ({ commands }) => {
          return commands.updateAttributes('paragraph', { elementType: type })
        },

      uppercaseCurrentBlock:
        () =>
        ({ state, tr }) => {
          const { $anchor } = state.selection
          const node = $anchor.parent
          if (node.type.name !== 'paragraph') return false
          const text = node.textContent
          if (!text || text === text.toUpperCase()) return true
          const from = $anchor.start()
          const to = $anchor.end()
          tr.replaceRangeWith(from, to, state.schema.text(text.toUpperCase()))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            let previousType: ElementType | null = null

            state.doc.forEach((node, offset) => {
              if (node.type.name !== 'paragraph') return

              const currentType = (node.attrs.elementType ?? 'action') as ElementType
              const blankLinesBefore = getScreenplaySpacingBefore(previousType, currentType)
              decorations.push(
                Decoration.node(offset, offset + node.nodeSize, {
                  'data-screenplay-space-before': String(blankLinesBefore),
                })
              )
              previousType = currentType
            })

            return DecorationSet.create(state.doc, decorations)
          },

          handleTextInput(view, from, to, text) {
            if (from !== to || text.length !== 1 || !/[a-z]/.test(text)) return false

            const { $from } = view.state.selection
            const node = $from.parent
            if (node.type.name !== 'paragraph') return false

            const currentType = (node.attrs.elementType ?? 'action') as ElementType
            const textBeforeCursor = node.textBetween(0, $from.parentOffset)
            if (!shouldSentenceCapitalize(currentType, textBeforeCursor)) return false

            view.dispatch(view.state.tr.insertText(text.toUpperCase(), from, to))
            return true
          },
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType
        const nextType = getTabNext(currentType)

        if (shouldUppercase(currentType)) {
          editor.chain().uppercaseCurrentBlock().setElementType(nextType).run()
        } else {
          editor.commands.setElementType(nextType)
        }
        return true
      },

      'Shift-Tab': ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType
        const prevType = getTabPrev(currentType)

        if (shouldUppercase(currentType)) {
          editor.chain().uppercaseCurrentBlock().setElementType(prevType).run()
        } else {
          editor.commands.setElementType(prevType)
        }
        return true
      },

      Enter: ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        if ($anchor.parentOffset !== node.content.size) return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType
        const nextType = getEnterNext(currentType)

        if (shouldUppercase(currentType)) {
          editor
            .chain()
            .uppercaseCurrentBlock()
            .splitBlock()
            .setElementType(nextType)
            .run()
        } else {
          editor.chain().splitBlock().setElementType(nextType).run()
        }
        return true
      },

      Backspace: ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        if (node.content.size !== 0) return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType

        if (currentType === 'dialogue') {
          editor.commands.setElementType('character')
          return true
        }

        if (currentType === 'character') {
          editor.commands.setElementType('action')
          return true
        }

        return false
      },
    }
  },
})
