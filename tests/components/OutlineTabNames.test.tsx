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
  it('no user-facing "Outline" label remains in the listed files', () => {
    for (const file of ['client/src/components/shell/TopBar.tsx', 'client/src/lib/leftZone.ts', 'client/src/components/writing/OutlineTab.tsx', 'client/src/components/writing/outline/ClearOutlineDialog.tsx', 'client/src/components/writing/outline/OutlineDocumentView.tsx', 'client/src/lib/documentMarkdown.ts']) {
      const lines = readFileSync(path.join(process.cwd(), file), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('import'))
      expect(lines.join('\n'), file).not.toMatch(/['"`][^'"`\n]*\bOutline\b[^'"`\n]*['"`]/)
    }
  })
})
