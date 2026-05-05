import { Extension } from '@tiptap/core'
import {
  ElementType,
  getTabNext,
  getTabPrev,
  getEnterNext,
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
