import React from 'react'
import type { MemoryReceipt } from '@shared/schema'

export function MemoryReceiptDisclosure({ receipt }: { receipt?: MemoryReceipt }) {
  if (!receipt) return null
  const label = receipt.status === 'disabled'
    ? 'Project memory disabled'
    : `Project memory revision ${receipt.revision}`
  return <span role="status" style={styles.disclosure}>{label}</span>
}

const styles: Record<string, React.CSSProperties> = {
  disclosure: {
    display: 'block',
    marginTop: 8,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  },
}
