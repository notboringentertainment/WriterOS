import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBar } from '../../client/src/components/shell/TopBar'

const minimalTopBarProps = {
  activeTab: 'script' as const,
  writersRoomActive: false,
  projectTitle: 'The Long Hallway',
  onTabChange: vi.fn(),
  onWritersRoom: vi.fn(),
  onVoiceProfile: vi.fn(),
  voiceProfileOpen: false,
}

describe('names on screen', () => {
  it('the writing tab says Beat Sheet, never Outline', () => {
    render(<TopBar {...minimalTopBarProps} />)
    expect(screen.getByText('Beat Sheet')).toBeInTheDocument()
    expect(screen.queryByText('Outline')).toBeNull()
  })
  it('no user-facing "outline" or "Outline" label remains in the listed files', () => {
    // Allowlist of internal-id strings that legitimately keep the word "outline"
    const allowedStrings = new Set([
      "'outline'",      // surface id for the beat sheet (single quotes in code)
      '"outline"',      // surface id for the beat sheet (double quotes in code)
      "'clear-outline-title'",  // data-testid in ClearOutlineDialog (single quotes)
      '"clear-outline-title"',  // data-testid in ClearOutlineDialog (double quotes)
    ])

    const files = [
      'client/src/components/shell/TopBar.tsx',
      'client/src/lib/leftZone.ts',
      'client/src/components/writing/OutlineTab.tsx',
      'client/src/components/writing/outline/ClearOutlineDialog.tsx',
      'client/src/components/writing/outline/OutlineDocumentView.tsx',
      'client/src/lib/documentMarkdown.ts',
      'client/src/components/writing/WritersRoom.tsx',
      'client/src/components/home/HomeSurface.tsx',
      'client/src/components/memory/MemoryPatchPreview.tsx',
      'client/src/lib/surfaceAwareness.ts',
    ]

    for (const file of files) {
      const content = readFileSync(path.join(process.cwd(), file), 'utf8')
      const lines = content.split('\n').filter(line => !line.trimStart().startsWith('import'))
      const fileContent = lines.join('\n')

      // Find all quoted strings containing "outline" (case-insensitive)
      const quotedOutlinePattern = /['"`][^'"`\n]*\boutline\b[^'"`\n]*['"`]/gi
      let match
      while ((match = quotedOutlinePattern.exec(fileContent)) !== null) {
        const quotedString = match[0]
        expect(allowedStrings.has(quotedString), `${file} contains disallowed quoted string: ${quotedString}`).toBe(true)
      }
    }
  })
})
