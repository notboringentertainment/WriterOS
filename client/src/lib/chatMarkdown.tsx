import React from 'react'

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>
    return part
  })
}

/**
 * Chat text with light markdown: **bold**, *italic*, `code`, and `#` headings shown as bold lines.
 * Line breaks are kept; the container keeps `white-space: pre-wrap`.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return <>{lines.map((line, i) => {
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    const content = heading ? <strong>{inline(heading[1], `h${i}`)}</strong> : inline(line, `l${i}`)
    return <React.Fragment key={i}>{content}{i < lines.length - 1 ? '\n' : null}</React.Fragment>
  })}</>
}
