# Voice Profile Drawer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TopBar-triggered right-side drawer that lets the writer view, manually edit, and clear their Voice Profile — stored in localStorage under `writeros_voice_profile_v1`, separate from ProjectState.

**Architecture:** Voice Profile state lives exclusively in localStorage (key already defined in `shared/voiceProfile.ts`). The drawer is triggered by a new button in TopBar's `rightZone`. Open/close state lives in `useShellState`. The drawer reads/writes localStorage directly on mount and on save; it holds edit state locally. No new API endpoint, no ProjectState changes.

**Tech Stack:** React (hooks, inline styles, CSS variables), Vitest for unit tests, existing `VoiceProfileState`/`VoiceProfileDocument` types from `@shared/voiceProfile`, existing `VOICE_PROFILE_STORAGE_KEY` and `completedVoiceProfileFromState` from `client/src/lib/voiceProfile.ts`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `client/src/lib/voiceProfile.ts` | Modify | Add `loadVoiceProfileState`, `saveVoiceProfileState`, `clearVoiceProfileState` |
| `tests/lib/voiceProfile.test.ts` | Modify | Tests for the three new storage functions |
| `client/src/lib/shellState.ts` | Modify | Add `voiceProfileOpen`, `toggleVoiceProfile`, `closeVoiceProfile` |
| `client/src/components/shell/TopBar.tsx` | Modify | Add `onVoiceProfile` + `voiceProfileOpen` props; button in `rightZone` |
| `client/src/components/shell/Shell.tsx` | Modify | Update `ShellState` interface; pass props to TopBar; render drawer |
| `client/src/components/shell/VoiceProfileDrawer.tsx` | Create | Right-side drawer: view mode, edit mode, clear, empty state |

---

## Task 1: Extend voiceProfile.ts with load / save / clear

**Files:**
- Modify: `client/src/lib/voiceProfile.ts`
- Modify: `tests/lib/voiceProfile.test.ts`

The existing file has `loadCompletedVoiceProfile` (returns only status=complete profiles). The drawer needs the full `VoiceProfileState` regardless of status, plus save and clear.

- [ ] **Step 1: Write failing tests for the three new functions**

Add to `tests/lib/voiceProfile.test.ts` after the existing `describe('Voice Profile loading', ...)` block:

```typescript
import {
  completedVoiceProfileFromState,
  loadCompletedVoiceProfile,
  parseCompletedVoiceProfile,
  loadVoiceProfileState,
  saveVoiceProfileState,
  clearVoiceProfileState,
} from '../../client/src/lib/voiceProfile'
import type { VoiceProfileState } from '@shared/voiceProfile'

// add inside the existing file, after the 'Voice Profile loading' describe block:

describe('Voice Profile state storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const minimalState: VoiceProfileState = {
    version: 1,
    status: 'draft_answers',
    answers: { q1: 'test answer' },
    updatedAt: '2026-05-12T00:00:00.000Z',
  }

  it('loadVoiceProfileState returns undefined when nothing stored', () => {
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('loadVoiceProfileState returns full state regardless of status', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(minimalState))
    const result = loadVoiceProfileState()
    expect(result).toEqual(minimalState)
  })

  it('loadVoiceProfileState returns undefined for malformed JSON', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, '{not json')
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('loadVoiceProfileState returns undefined when stored object lacks required shape', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('saveVoiceProfileState writes to the correct key', () => {
    saveVoiceProfileState(minimalState)
    const raw = localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.status).toBe('draft_answers')
    expect(parsed.answers.q1).toBe('test answer')
  })

  it('saveVoiceProfileState updates updatedAt to current time', () => {
    const before = new Date().toISOString()
    saveVoiceProfileState(minimalState)
    const raw = localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)!
    const parsed = JSON.parse(raw)
    expect(parsed.updatedAt >= before).toBe(true)
  })

  it('clearVoiceProfileState removes the key', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(minimalState))
    clearVoiceProfileState()
    expect(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)).toBeNull()
  })

  it('clearVoiceProfileState is safe when nothing is stored', () => {
    expect(() => clearVoiceProfileState()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run test:run -- tests/lib/voiceProfile.test.ts 2>&1 | tail -20
```

Expected: failures citing `loadVoiceProfileState is not a function` (or similar import errors).

- [ ] **Step 3: Add the three functions to voiceProfile.ts**

Open `client/src/lib/voiceProfile.ts`. The file already imports `VOICE_PROFILE_STORAGE_KEY` and `VoiceProfileDocument` from `@shared/voiceProfile`. Add `VoiceProfileState` to that import, then append the three functions at the end:

```typescript
// At top of file, update the import:
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument, type VoiceProfileState } from '@shared/voiceProfile'

// Append at the end of the file:

export function loadVoiceProfileState(): VoiceProfileState | undefined {
  if (typeof localStorage === 'undefined') return undefined
  const raw = localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).version === 1 &&
      typeof (parsed as Record<string, unknown>).status === 'string'
    ) {
      return parsed as VoiceProfileState
    }
    return undefined
  } catch {
    return undefined
  }
}

export function saveVoiceProfileState(state: VoiceProfileState): void {
  localStorage.setItem(
    VOICE_PROFILE_STORAGE_KEY,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() })
  )
}

export function clearVoiceProfileState(): void {
  localStorage.removeItem(VOICE_PROFILE_STORAGE_KEY)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run test:run -- tests/lib/voiceProfile.test.ts 2>&1 | tail -20
```

Expected: all tests in that file pass.

- [ ] **Step 5: TypeScript check**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && git add client/src/lib/voiceProfile.ts tests/lib/voiceProfile.test.ts && git commit -m "feat: add loadVoiceProfileState, saveVoiceProfileState, clearVoiceProfileState"
```

---

## Task 2: Add voiceProfileOpen to useShellState + update Shell's ShellState interface

**Files:**
- Modify: `client/src/lib/shellState.ts`
- Modify: `client/src/components/shell/Shell.tsx` (interface only, not the render)

- [ ] **Step 1: Add voiceProfileOpen state to shellState.ts**

In `client/src/lib/shellState.ts`, add to the existing `useShellState` function:

```typescript
// After the existing useState declarations (after focusMode, storyBibleSection):
const [voiceProfileOpen, setVoiceProfileOpen] = useState(false)

// Add these two callbacks alongside the existing ones:
const toggleVoiceProfile = useCallback(() => {
  setVoiceProfileOpen(prev => !prev)
}, [])

const closeVoiceProfile = useCallback(() => {
  setVoiceProfileOpen(false)
}, [])

// Add to the return object:
return {
  // ...existing fields...
  voiceProfileOpen,
  toggleVoiceProfile,
  closeVoiceProfile,
}
```

The full updated return object (replace the existing one entirely):

```typescript
  return {
    activeTab,
    writersRoomActive,
    panelOpen,
    focusMode,
    storyBibleSection,
    voiceProfileOpen,
    setActiveTab,
    togglePanel,
    enterWritersRoom,
    exitWritersRoom,
    toggleFocusMode,
    setStoryBibleSection,
    toggleVoiceProfile,
    closeVoiceProfile,
  }
```

- [ ] **Step 2: Update ShellState interface in Shell.tsx**

In `client/src/components/shell/Shell.tsx`, the local `ShellState` interface mirrors the hook's return type. Add the three new fields:

```typescript
interface ShellState {
  activeTab: ActiveTab
  writersRoomActive: boolean
  panelOpen: boolean
  focusMode: boolean
  storyBibleSection: StoryBibleSection | null
  voiceProfileOpen: boolean        // ← add
  setActiveTab: (tab: ActiveTab) => void
  togglePanel: () => void
  enterWritersRoom: () => void
  exitWritersRoom: () => void
  toggleFocusMode: () => void
  toggleVoiceProfile: () => void   // ← add
  closeVoiceProfile: () => void    // ← add
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run check 2>&1 | tail -20
```

Expected: no errors (Shell doesn't yet pass the new props to TopBar, but the interface is in place).

- [ ] **Step 4: Commit**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && git add client/src/lib/shellState.ts client/src/components/shell/Shell.tsx && git commit -m "feat: add voiceProfileOpen toggle state to useShellState"
```

---

## Task 3: Add Voice Profile button to TopBar + wire through Shell

**Files:**
- Modify: `client/src/components/shell/TopBar.tsx`
- Modify: `client/src/components/shell/Shell.tsx` (pass new props to TopBar)

The button lives in `rightZone`, left of the existing "Writer's Room" button. It uses a plain text label ("Voice") for MVP — no icon library dependency.

- [ ] **Step 1: Add props and button to TopBar.tsx**

In `client/src/components/shell/TopBar.tsx`:

Add two new props to `TopBarProps`:

```typescript
interface TopBarProps {
  activeTab: WritingTab
  writersRoomActive: boolean
  projectTitle: string
  onProjectTitleChange?: (title: string) => void
  onTabChange: (tab: WritingTab) => void
  onWritersRoom: () => void
  onVoiceProfile: () => void       // ← add
  voiceProfileOpen: boolean        // ← add
}
```

Destructure in the function signature:

```typescript
export function TopBar({
  activeTab,
  writersRoomActive,
  projectTitle,
  onProjectTitleChange,
  onTabChange,
  onWritersRoom,
  onVoiceProfile,
  voiceProfileOpen,
}: TopBarProps) {
```

In the JSX `rightZone` div, add the Voice Profile button **before** the Writer's Room button:

```tsx
<div style={styles.rightZone}>
  <button
    type="button"
    aria-label="Voice Profile"
    aria-pressed={voiceProfileOpen}
    style={{
      ...styles.cmdK,
      ...(voiceProfileOpen
        ? { color: 'var(--primary)', borderColor: 'var(--primary-dim)', background: 'hsla(260, 100%, 80%, 0.08)' }
        : {}),
    }}
    onClick={onVoiceProfile}
  >
    Voice
  </button>
  <button
    role="tab"
    aria-selected={writersRoomActive}
    style={{ ...styles.writersRoom, ...(writersRoomActive ? styles.writersRoomActive : {}) }}
    onClick={onWritersRoom}
  >
    Writer's Room
  </button>
  <button style={styles.cmdK} title="⌘K">⌘K</button>
</div>
```

- [ ] **Step 2: Wire new props in Shell.tsx**

In `Shell.tsx`, the `TopBar` render currently passes:

```tsx
<TopBar
  activeTab={activeTab}
  writersRoomActive={writersRoomActive}
  projectTitle={projectTitle}
  onProjectTitleChange={onProjectTitleChange}
  onTabChange={setActiveTab}
  onWritersRoom={handleWritersRoom}
/>
```

Add the two new props (destructure `voiceProfileOpen` and `toggleVoiceProfile` from `shellState` first):

```tsx
// In the destructure at the top of Shell():
const {
  activeTab, writersRoomActive, panelOpen, focusMode,
  storyBibleSection, voiceProfileOpen,
  setActiveTab, togglePanel, enterWritersRoom, exitWritersRoom,
  toggleFocusMode, toggleVoiceProfile, closeVoiceProfile,
} = shellState

// Updated TopBar render:
<TopBar
  activeTab={activeTab}
  writersRoomActive={writersRoomActive}
  projectTitle={projectTitle}
  onProjectTitleChange={onProjectTitleChange}
  onTabChange={setActiveTab}
  onWritersRoom={handleWritersRoom}
  onVoiceProfile={toggleVoiceProfile}
  voiceProfileOpen={voiceProfileOpen}
/>
```

- [ ] **Step 3: TypeScript check**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run check 2>&1 | tail -20
```

Expected: no errors. (Shell will have an unused `closeVoiceProfile` until Task 4 — that's fine, TypeScript doesn't error on unused destructured variables.)

- [ ] **Step 4: Full test suite**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run test:run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && git add client/src/components/shell/TopBar.tsx client/src/components/shell/Shell.tsx && git commit -m "feat: add Voice Profile button to TopBar"
```

---

## Task 4: Build VoiceProfileDrawer — empty state + view mode + clear

**Files:**
- Create: `client/src/components/shell/VoiceProfileDrawer.tsx`
- Modify: `client/src/components/shell/Shell.tsx` (import + render drawer)

The drawer is fixed-position, right side, slides over the content. It reads from localStorage on open. Clear asks for a second click to confirm.

- [ ] **Step 1: Create VoiceProfileDrawer.tsx**

Create `client/src/components/shell/VoiceProfileDrawer.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import type { VoiceProfileDocument, VoiceProfileState } from '@shared/voiceProfile'
import {
  loadVoiceProfileState,
  clearVoiceProfileState,
} from '../../lib/voiceProfile'

interface VoiceProfileDrawerProps {
  open: boolean
  onClose: () => void
}

type DrawerMode = 'view' | 'edit'

export function VoiceProfileDrawer({ open, onClose }: VoiceProfileDrawerProps) {
  const [profileState, setProfileState] = useState<VoiceProfileState | undefined>(undefined)
  const [mode, setMode] = useState<DrawerMode>('view')
  const [clearPending, setClearPending] = useState(false)

  useEffect(() => {
    if (open) {
      setProfileState(loadVoiceProfileState())
      setMode('view')
      setClearPending(false)
    }
  }, [open])

  function handleClear() {
    if (!clearPending) {
      setClearPending(true)
      return
    }
    clearVoiceProfileState()
    setProfileState(undefined)
    setClearPending(false)
  }

  if (!open) return null

  const profile = profileState?.profile
  const status = profileState?.status ?? 'not_started'

  return (
    <>
      <div
        aria-hidden="true"
        style={styles.backdrop}
        onClick={onClose}
      />
      <aside
        aria-label="Voice Profile"
        style={styles.drawer}
      >
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.drawerTitle}>Voice Profile</span>
            <StatusBadge status={status} />
          </div>
          <button
            type="button"
            aria-label="Close Voice Profile"
            style={styles.closeButton}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div style={styles.body}>
          {!profile ? (
            <EmptyState />
          ) : mode === 'view' ? (
            <ViewMode profile={profile} />
          ) : null}
        </div>

        {profile && mode === 'view' && (
          <div style={styles.footer}>
            <button
              type="button"
              style={styles.editButton}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              style={clearPending ? styles.clearButtonConfirm : styles.clearButton}
              onClick={handleClear}
            >
              {clearPending ? 'Confirm clear' : 'Clear profile'}
            </button>
            {clearPending && (
              <button
                type="button"
                style={styles.cancelClear}
                onClick={() => setClearPending(false)}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {!profile && (
          <div style={styles.footer}>
            <span style={styles.footerHint}>
              Complete the Voice Profile assessment to generate your profile.
            </span>
          </div>
        )}
      </aside>
    </>
  )
}

function StatusBadge({ status }: { status: VoiceProfileState['status'] }) {
  const label: Record<VoiceProfileState['status'], string> = {
    not_started: 'No profile',
    skipped: 'Skipped',
    draft_answers: 'In progress',
    draft_profile: 'Draft',
    complete: 'Complete',
  }
  const color: Record<VoiceProfileState['status'], string> = {
    not_started: 'var(--fg-subtle)',
    skipped: 'var(--fg-subtle)',
    draft_answers: 'var(--fg-muted)',
    draft_profile: 'var(--fg-muted)',
    complete: 'var(--primary)',
  }
  return (
    <span style={{ ...styles.badge, color: color[status] }}>
      {label[status]}
    </span>
  )
}

function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <p style={styles.emptyTitle}>No Voice Profile yet</p>
      <p style={styles.emptyBody}>
        Complete the Voice Profile assessment to let WriterOS understand your creative voice.
        Your profile will be used to tailor AI feedback to how you write.
      </p>
    </div>
  )
}

function ViewMode({ profile }: { profile: VoiceProfileDocument }) {
  return (
    <div style={styles.viewRoot}>
      {profile.displayName && (
        <ProfileSection label="Writer">
          <ProfileText>{profile.displayName}</ProfileText>
        </ProfileSection>
      )}

      <ProfileSection label="Archetype">
        <ProfileText>{profile.archetype}</ProfileText>
      </ProfileSection>

      <ProfileSection label="Core statement">
        <ProfileText>{profile.coreStatement}</ProfileText>
      </ProfileSection>

      <ProfileSection label="Creative north stars">
        <ProfileList items={profile.creativeNorthStars} />
      </ProfileSection>

      <ProfileSection label="Storytelling DNA">
        <ProfileSubLabel>Principles</ProfileSubLabel>
        <ProfileList items={profile.storytellingDNA.principles} />
        <ProfileSubLabel>Recurring themes</ProfileSubLabel>
        <ProfileList items={profile.storytellingDNA.recurringThemes} />
        {profile.storytellingDNA.notes && (
          <ProfileText muted>{profile.storytellingDNA.notes}</ProfileText>
        )}
      </ProfileSection>

      <ProfileSection label="Influences">
        {profile.influences.writers.length > 0 && (
          <><ProfileSubLabel>Writers</ProfileSubLabel><ProfileList items={profile.influences.writers} /></>
        )}
        {profile.influences.directors.length > 0 && (
          <><ProfileSubLabel>Directors</ProfileSubLabel><ProfileList items={profile.influences.directors} /></>
        )}
        {profile.influences.filmsAndShows.length > 0 && (
          <><ProfileSubLabel>Films & shows</ProfileSubLabel><ProfileList items={profile.influences.filmsAndShows} /></>
        )}
        {profile.influences.notes && (
          <ProfileText muted>{profile.influences.notes}</ProfileText>
        )}
      </ProfileSection>

      <ProfileSection label="Character instincts">
        <ProfileSubLabel>Drawn to</ProfileSubLabel>
        <ProfileList items={profile.characterInstincts.drawnTo} />
        <ProfileSubLabel>Rejects</ProfileSubLabel>
        <ProfileList items={profile.characterInstincts.rejects} />
        {profile.characterInstincts.notes && (
          <ProfileText muted>{profile.characterInstincts.notes}</ProfileText>
        )}
      </ProfileSection>

      <ProfileSection label="Dialogue">
        <ProfileSubLabel>Rules</ProfileSubLabel>
        <ProfileList items={profile.dialogue.rules} />
        {profile.dialogue.instinctsByMode && (
          <ProfileText muted>{profile.dialogue.instinctsByMode}</ProfileText>
        )}
        {profile.dialogue.avoidances.length > 0 && (
          <><ProfileSubLabel>Avoidances</ProfileSubLabel><ProfileList items={profile.dialogue.avoidances} /></>
        )}
      </ProfileSection>

      <ProfileSection label="Visual language">
        <ProfileList items={profile.visualLanguage.instincts} />
        {profile.visualLanguage.notes && (
          <ProfileText muted>{profile.visualLanguage.notes}</ProfileText>
        )}
      </ProfileSection>

      <ProfileSection label="Process">
        {profile.process.whenFlowing && (
          <ProfileText>{profile.process.whenFlowing}</ProfileText>
        )}
        {profile.process.stuckPatterns.length > 0 && (
          <><ProfileSubLabel>Stuck patterns</ProfileSubLabel><ProfileList items={profile.process.stuckPatterns} /></>
        )}
        {profile.process.supportNeeds.length > 0 && (
          <><ProfileSubLabel>Support needs</ProfileSubLabel><ProfileList items={profile.process.supportNeeds} /></>
        )}
      </ProfileSection>

      <ProfileSection label="Strengths">
        <ProfileList items={profile.strengths} />
      </ProfileSection>

      <ProfileSection label="Growth edges">
        <ProfileList items={profile.growthEdges} />
      </ProfileSection>

      <ProfileSection label="Collaboration">
        <ProfileSubLabel>Always</ProfileSubLabel>
        <ProfileList items={profile.collaborationPreferences.always} />
        <ProfileSubLabel>Never</ProfileSubLabel>
        <ProfileList items={profile.collaborationPreferences.never} />
        {profile.collaborationPreferences.feedbackStyle && (
          <ProfileText muted>{profile.collaborationPreferences.feedbackStyle}</ProfileText>
        )}
      </ProfileSection>

      {profile.alexCoachingNotes.length > 0 && (
        <ProfileSection label="Alex coaching notes">
          <ProfileList items={profile.alexCoachingNotes} />
        </ProfileSection>
      )}
    </div>
  )
}

function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionLabel}>{label}</h3>
      {children}
    </section>
  )
}

function ProfileSubLabel({ children }: { children: React.ReactNode }) {
  return <p style={styles.subLabel}>{children}</p>
}

function ProfileText({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <p style={{ ...styles.profileText, ...(muted ? { color: 'var(--fg-muted)' } : {}) }}>{children}</p>
}

function ProfileList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul style={styles.profileList}>
      {items.map((item, i) => (
        <li key={i} style={styles.profileListItem}>{item}</li>
      ))}
    </ul>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 19,
    background: 'transparent',
  },
  drawer: {
    position: 'fixed',
    top: 'var(--topbar-height)',
    right: 0,
    bottom: 0,
    width: 440,
    background: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  drawerTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    fontSize: 14,
    color: 'var(--fg)',
    letterSpacing: '-0.01em',
  },
  badge: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--fg-subtle)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
  },
  footer: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  footerHint: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    lineHeight: 1.5,
  },
  editButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '5px 14px',
    cursor: 'pointer',
  },
  clearButton: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '5px 14px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  clearButtonConfirm: {
    background: 'none',
    border: '1px solid var(--error, #c0392b)',
    borderRadius: 6,
    color: 'var(--error, #c0392b)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '5px 14px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  cancelClear: {
    background: 'none',
    border: 'none',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '5px 8px',
    cursor: 'pointer',
  },
  emptyState: {
    padding: '32px 0',
    textAlign: 'center' as const,
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--fg)',
    marginBottom: 10,
  },
  emptyBody: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.6,
    maxWidth: 320,
    margin: '0 auto',
  },
  viewRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  section: {
    borderBottom: '1px solid var(--border)',
    paddingBottom: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    marginTop: 0,
  },
  subLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.02em',
    marginTop: 10,
    marginBottom: 4,
  },
  profileText: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.55,
    margin: '4px 0',
  },
  profileList: {
    margin: 0,
    paddingLeft: 16,
  },
  profileListItem: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.55,
    marginBottom: 3,
  },
}
```

- [ ] **Step 2: Render VoiceProfileDrawer in Shell.tsx**

In `client/src/components/shell/Shell.tsx`, import the drawer and render it inside the root div, after the `<main>` block:

```tsx
import { VoiceProfileDrawer } from './VoiceProfileDrawer'

// In the return JSX, after the closing </main> or at the end of the root <div>:
<VoiceProfileDrawer
  open={voiceProfileOpen}
  onClose={closeVoiceProfile}
/>
```

The full root div structure becomes:

```tsx
return (
  <div style={styles.root}>
    {!focusMode && (
      <TopBar
        activeTab={activeTab}
        writersRoomActive={writersRoomActive}
        projectTitle={projectTitle}
        onProjectTitleChange={onProjectTitleChange}
        onTabChange={setActiveTab}
        onWritersRoom={handleWritersRoom}
        onVoiceProfile={toggleVoiceProfile}
        voiceProfileOpen={voiceProfileOpen}
      />
    )}
    <div style={styles.body}>
      {!writersRoomActive && !focusMode && (
        <LeftRail
          open={panelOpen}
          onToggle={togglePanel}
          projectTitle={displayProjectTitle}
          activeTab={activeTab}
          storyBibleSection={storyBibleSection}
          {...railProps}
        />
      )}
      <main style={styles.center}>
        {children}
      </main>
    </div>
    <VoiceProfileDrawer
      open={voiceProfileOpen}
      onClose={closeVoiceProfile}
    />
  </div>
)
```

- [ ] **Step 3: TypeScript check**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Full test suite**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run test:run 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Start dev server and verify visually**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run dev
```

Verify in browser at `http://localhost:5173`:
- "Voice" button appears in TopBar right zone, left of "Writer's Room"
- Clicking it opens the right-side drawer
- With no profile in localStorage: empty state shows
- Load the seed file into localStorage manually for visual test:
  In browser console: `localStorage.setItem('writeros_voice_profile_v1', JSON.stringify({version:1,status:'complete',answers:{},profile:{...},updatedAt:'2026-05-12T00:00:00.000Z'}))` then refresh
- After seeding: status badge shows "Complete", all sections render with content
- "Clear profile" button: first click shows "Confirm clear" (red), second click clears and shows empty state
- Clicking the backdrop or ✕ closes the drawer
- Clicking "Voice" again reopens

- [ ] **Step 6: Commit**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && git add client/src/components/shell/VoiceProfileDrawer.tsx client/src/components/shell/Shell.tsx && git commit -m "feat: add VoiceProfileDrawer with view mode, empty state, and clear"
```

---

## Task 5: Add edit mode to VoiceProfileDrawer

**Files:**
- Modify: `client/src/components/shell/VoiceProfileDrawer.tsx`

Edit mode converts all VoiceProfileDocument fields to form inputs. Arrays become `\n`-joined textareas. On save, splits back to arrays, validates minimum required fields are non-empty, writes to localStorage.

- [ ] **Step 1: Add EditDraft type and conversion helpers at the top of VoiceProfileDrawer.tsx**

Add after the imports, before the component:

```tsx
type EditDraft = {
  displayName: string
  archetype: string
  coreStatement: string
  creativeNorthStars: string
  dnaPrinciples: string
  dnaThemes: string
  dnaNotes: string
  influenceWriters: string
  influenceDirectors: string
  influenceFilms: string
  influenceScenes: string
  influenceNotes: string
  characterDrawnTo: string
  characterRejects: string
  characterNotes: string
  dialogueRules: string
  dialogueInstincts: string
  dialogueAvoidances: string
  visualInstincts: string
  visualNotes: string
  processFlowing: string
  processStuck: string
  processSupport: string
  strengths: string
  growthEdges: string
  collabAlways: string
  collabNever: string
  collabFeedback: string
  alexNotes: string
}

function join(arr: string[]): string { return arr.join('\n') }
function split(text: string): string[] {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}

function profileToEditDraft(profile: VoiceProfileDocument): EditDraft {
  return {
    displayName: profile.displayName ?? '',
    archetype: profile.archetype,
    coreStatement: profile.coreStatement,
    creativeNorthStars: join(profile.creativeNorthStars),
    dnaPrinciples: join(profile.storytellingDNA.principles),
    dnaThemes: join(profile.storytellingDNA.recurringThemes),
    dnaNotes: profile.storytellingDNA.notes,
    influenceWriters: join(profile.influences.writers),
    influenceDirectors: join(profile.influences.directors),
    influenceFilms: join(profile.influences.filmsAndShows),
    influenceScenes: join(profile.influences.scenesAndLines),
    influenceNotes: profile.influences.notes,
    characterDrawnTo: join(profile.characterInstincts.drawnTo),
    characterRejects: join(profile.characterInstincts.rejects),
    characterNotes: profile.characterInstincts.notes,
    dialogueRules: join(profile.dialogue.rules),
    dialogueInstincts: profile.dialogue.instinctsByMode,
    dialogueAvoidances: join(profile.dialogue.avoidances),
    visualInstincts: join(profile.visualLanguage.instincts),
    visualNotes: profile.visualLanguage.notes,
    processFlowing: profile.process.whenFlowing,
    processStuck: join(profile.process.stuckPatterns),
    processSupport: join(profile.process.supportNeeds),
    strengths: join(profile.strengths),
    growthEdges: join(profile.growthEdges),
    collabAlways: join(profile.collaborationPreferences.always),
    collabNever: join(profile.collaborationPreferences.never),
    collabFeedback: profile.collaborationPreferences.feedbackStyle,
    alexNotes: join(profile.alexCoachingNotes),
  }
}

function editDraftToProfile(draft: EditDraft, existing: VoiceProfileDocument): VoiceProfileDocument {
  return {
    ...existing,
    displayName: draft.displayName.trim() || undefined,
    archetype: draft.archetype.trim(),
    coreStatement: draft.coreStatement.trim(),
    creativeNorthStars: split(draft.creativeNorthStars),
    storytellingDNA: {
      principles: split(draft.dnaPrinciples),
      recurringThemes: split(draft.dnaThemes),
      notes: draft.dnaNotes.trim(),
    },
    influences: {
      writers: split(draft.influenceWriters),
      directors: split(draft.influenceDirectors),
      filmsAndShows: split(draft.influenceFilms),
      scenesAndLines: split(draft.influenceScenes),
      notes: draft.influenceNotes.trim(),
    },
    characterInstincts: {
      drawnTo: split(draft.characterDrawnTo),
      rejects: split(draft.characterRejects),
      notes: draft.characterNotes.trim(),
    },
    dialogue: {
      rules: split(draft.dialogueRules),
      instinctsByMode: draft.dialogueInstincts.trim(),
      avoidances: split(draft.dialogueAvoidances),
    },
    visualLanguage: {
      instincts: split(draft.visualInstincts),
      notes: draft.visualNotes.trim(),
    },
    process: {
      whenFlowing: draft.processFlowing.trim(),
      stuckPatterns: split(draft.processStuck),
      supportNeeds: split(draft.processSupport),
    },
    strengths: split(draft.strengths),
    growthEdges: split(draft.growthEdges),
    collaborationPreferences: {
      always: split(draft.collabAlways),
      never: split(draft.collabNever),
      feedbackStyle: draft.collabFeedback.trim(),
    },
    alexCoachingNotes: split(draft.alexNotes),
    updatedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 2: Add edit state and handlers to VoiceProfileDrawer**

In the `VoiceProfileDrawer` component, add to the existing state declarations:

```tsx
const [editDraft, setEditDraft] = useState<EditDraft | undefined>(undefined)
const [saveError, setSaveError] = useState<string | undefined>(undefined)
```

Add `handleStartEdit`, `handleCancelEdit`, `handleSave` functions:

```tsx
function handleStartEdit() {
  if (!profileState?.profile) return
  setEditDraft(profileToEditDraft(profileState.profile))
  setSaveError(undefined)
  setMode('edit')
}

function handleCancelEdit() {
  setEditDraft(undefined)
  setSaveError(undefined)
  setMode('view')
}

function handleSave() {
  if (!editDraft || !profileState?.profile) return
  const archetype = editDraft.archetype.trim()
  const coreStatement = editDraft.coreStatement.trim()
  if (!archetype || !coreStatement) {
    setSaveError('Archetype and core statement are required.')
    return
  }
  const updatedProfile = editDraftToProfile(editDraft, profileState.profile)
  const updatedState: VoiceProfileState = {
    ...profileState,
    profile: updatedProfile,
    updatedAt: new Date().toISOString(),
  }
  saveVoiceProfileState(updatedState)
  setProfileState(updatedState)
  setEditDraft(undefined)
  setSaveError(undefined)
  setMode('view')
}
```

Import `saveVoiceProfileState` — add it to the existing import from `../../lib/voiceProfile`.

Update the `useEffect` to also reset edit state on open:

```tsx
useEffect(() => {
  if (open) {
    setProfileState(loadVoiceProfileState())
    setMode('view')
    setEditDraft(undefined)
    setSaveError(undefined)
    setClearPending(false)
  }
}, [open])
```

- [ ] **Step 3: Update JSX to render edit mode and update footer buttons**

Replace the `<div style={styles.body}>` content to include the edit mode branch:

```tsx
<div style={styles.body}>
  {!profile ? (
    <EmptyState />
  ) : mode === 'view' ? (
    <ViewMode profile={profile} />
  ) : editDraft ? (
    <EditMode draft={editDraft} onChange={setEditDraft} error={saveError} />
  ) : null}
</div>
```

Replace the footer block:

```tsx
{profile && mode === 'view' && (
  <div style={styles.footer}>
    <button type="button" style={styles.editButton} onClick={handleStartEdit}>
      Edit
    </button>
    <button
      type="button"
      style={clearPending ? styles.clearButtonConfirm : styles.clearButton}
      onClick={handleClear}
    >
      {clearPending ? 'Confirm clear' : 'Clear profile'}
    </button>
    {clearPending && (
      <button type="button" style={styles.cancelClear} onClick={() => setClearPending(false)}>
        Cancel
      </button>
    )}
  </div>
)}

{profile && mode === 'edit' && (
  <div style={styles.footer}>
    <button type="button" style={styles.editButton} onClick={handleSave}>
      Save
    </button>
    <button type="button" style={styles.cancelClear} onClick={handleCancelEdit}>
      Cancel
    </button>
  </div>
)}

{!profile && (
  <div style={styles.footer}>
    <span style={styles.footerHint}>
      Complete the Voice Profile assessment to generate your profile.
    </span>
  </div>
)}
```

- [ ] **Step 4: Add EditMode component**

Add to the bottom of `VoiceProfileDrawer.tsx` (before the styles object):

```tsx
function EditMode({
  draft,
  onChange,
  error,
}: {
  draft: EditDraft
  onChange: (d: EditDraft) => void
  error: string | undefined
}) {
  function field(key: keyof EditDraft, label: string, rows = 2) {
    return (
      <div style={editStyles.field}>
        <label style={editStyles.label}>{label}</label>
        <textarea
          rows={rows}
          value={draft[key]}
          onChange={e => onChange({ ...draft, [key]: e.target.value })}
          style={editStyles.textarea}
        />
      </div>
    )
  }

  return (
    <div style={editStyles.root}>
      {error && <p style={editStyles.error}>{error}</p>}

      <EditSection title="Identity">
        {field('displayName', 'Display name', 1)}
        {field('archetype', 'Archetype', 2)}
        {field('coreStatement', 'Core statement', 4)}
        {field('creativeNorthStars', 'Creative north stars (one per line)', 4)}
      </EditSection>

      <EditSection title="Storytelling DNA">
        {field('dnaPrinciples', 'Principles (one per line)', 5)}
        {field('dnaThemes', 'Recurring themes (one per line)', 3)}
        {field('dnaNotes', 'Notes', 2)}
      </EditSection>

      <EditSection title="Influences">
        {field('influenceWriters', 'Writers (one per line)', 3)}
        {field('influenceDirectors', 'Directors (one per line)', 3)}
        {field('influenceFilms', 'Films & shows (one per line)', 3)}
        {field('influenceScenes', 'Scenes & lines (one per line)', 4)}
        {field('influenceNotes', 'Notes', 2)}
      </EditSection>

      <EditSection title="Character instincts">
        {field('characterDrawnTo', 'Drawn to (one per line)', 4)}
        {field('characterRejects', 'Rejects (one per line)', 4)}
        {field('characterNotes', 'Notes', 2)}
      </EditSection>

      <EditSection title="Dialogue">
        {field('dialogueRules', 'Rules (one per line)', 4)}
        {field('dialogueInstincts', 'Instincts by mode', 2)}
        {field('dialogueAvoidances', 'Avoidances (one per line)', 3)}
      </EditSection>

      <EditSection title="Visual language">
        {field('visualInstincts', 'Instincts (one per line)', 4)}
        {field('visualNotes', 'Notes', 2)}
      </EditSection>

      <EditSection title="Process">
        {field('processFlowing', 'When flowing', 2)}
        {field('processStuck', 'Stuck patterns (one per line)', 3)}
        {field('processSupport', 'Support needs (one per line)', 3)}
      </EditSection>

      <EditSection title="Strengths & growth">
        {field('strengths', 'Strengths (one per line)', 4)}
        {field('growthEdges', 'Growth edges (one per line)', 3)}
      </EditSection>

      <EditSection title="Collaboration">
        {field('collabAlways', 'Always (one per line)', 4)}
        {field('collabNever', 'Never (one per line)', 4)}
        {field('collabFeedback', 'Feedback style', 2)}
      </EditSection>

      <EditSection title="Alex coaching notes">
        {field('alexNotes', 'Notes (one per line)', 3)}
      </EditSection>
    </div>
  )
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={editStyles.section}>
      <h3 style={editStyles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

const editStyles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 0 },
  section: { borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginTop: 0,
    marginBottom: 10,
  },
  field: { marginBottom: 12 },
  label: {
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    marginBottom: 4,
    letterSpacing: '0.01em',
  },
  textarea: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '6px 8px',
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  error: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--error, #c0392b)',
    marginBottom: 12,
  },
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Full test suite**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && npm run test:run 2>&1 | tail -10
```

Expected: 308+ tests pass, none fail.

- [ ] **Step 7: Visual verification — edit mode**

With dev server running (`npm run dev`):

- Open Voice Profile drawer (seed a profile in localStorage first if needed)
- Click "Edit" — form appears, all fields pre-populated from saved profile
- Modify "Archetype" field — change a word
- Click "Save" — drawer returns to view mode, updated text visible
- Re-open edit mode, clear "Archetype" field entirely, click "Save" — error message appears: "Archetype and core statement are required."
- Click "Cancel" — returns to view mode without saving

- [ ] **Step 8: Commit**

```bash
cd "/Users/ben/Desktop/AI Apps/WriterOS" && git add client/src/components/shell/VoiceProfileDrawer.tsx && git commit -m "feat: add edit mode to VoiceProfileDrawer"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| TopBar entry point button | Task 3 |
| Right-side drawer panel | Task 4 |
| Show current Voice Profile status | Task 4 (StatusBadge) |
| View the saved profile | Task 4 (ViewMode) |
| Edit/save manually | Task 5 (EditMode) |
| Clear/reset | Task 4 (handleClear, two-click confirm) |
| "No profile yet" empty state | Task 4 (EmptyState) |
| Writer-scoped, separate from ProjectState | All tasks — no ProjectState import anywhere in new files |
| Uses existing `VoiceProfileState` types | Task 1, 4, 5 |
| Reads/writes `writeros_voice_profile_v1` key | Task 1 (functions), Task 4/5 (via those functions) |

**Placeholder scan:** None found. All steps include complete code.

**Type consistency:**
- `EditDraft` defined in Task 5 Step 1, used in same task throughout ✓
- `VoiceProfileDrawer` props (`open`, `onClose`) consistent across Task 4 creation and Shell.tsx wiring ✓
- `loadVoiceProfileState`, `saveVoiceProfileState`, `clearVoiceProfileState` defined in Task 1, imported in Task 4 Step 1 and Task 5 Step 2 ✓
- `voiceProfileOpen`, `toggleVoiceProfile`, `closeVoiceProfile` defined in Task 2, passed in Task 3 (TopBar) and Task 4 (Shell render) ✓
- `ShellState` interface updated in Task 2, consumed in Task 3/4 ✓
