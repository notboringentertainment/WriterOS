# Slice 4 — External Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Implemented on `slice-4-storage-migration` and open as PR #11. Automated verification passed (`npm run test:run`, `npm run check`, `npm run build`). Manual browser QA remains listed below for reviewer/product sign-off.

**Goal:** Let writers migrate their existing localStorage-backed projects into a user-selected folder as `.writeros` packages, with one explicit confirmation, preserved ids, preserved active project, and a non-destructive marker on the localStorage side. Make the shipped app independent of localStorage as the primary storage path while keeping localStorage as the browser-preview fallback.

**Architecture:** A pure coordinator function (`migrateLocalStorageToFolder`) takes an injected `ProjectStorageAdapter` plus the list of `StoredProject`s and writes each unmigrated project into the folder, returning per-project results. The `useWriterOSProjectsFolder` hook exposes a `runMigration` method that resolves the adapter and forwards results. `projectLibrary.ts` gains a `migratedToFolder` marker so migrated projects are hidden from the localStorage "Local projects" view but remain physically present as a safety backup. `HomeSurface` shows a one-shot migration confirmation modal when a folder is connected and unmigrated localStorage projects exist. Vault PRD constraint: reserve `vault/` and `_vault/` paths — the adapter must keep ignoring non-`.writeros` workspace entries (regression-tested), and must not delete/rewrite a `vault/` subfolder inside the package (already true for write; verify for list).

**Tech Stack:** React 18 + Vite + TypeScript; Vitest + jsdom + @testing-library/react; File System Access API via existing `projectStorage.ts` adapter; localStorage via existing `projectLibrary.ts`.

---

## Product Decisions (Locked Before Plan)

1. **Migration UX:** Migrate-all-after-one-confirm. One modal lists every unmigrated localStorage project; one button migrates all of them. No per-project deselection in V1.
2. **localStorage retention:** Mark migrated, keep entries. A `migratedToFolder` field is added to the `StoredProject` shape. Migrated entries are hidden from the active library list (Home active count) and from active-project selection, but the raw JSON stays in `writeros_project_library` as a safety backup. A future Settings action can clear it; that action is out of scope here.
3. **Active project after migration:** If the currently-active localStorage project is among those migrated, the active session does **not** silently jump to the file-backed copy. We mirror the existing archive-active behavior: clear the active id, return the writer to Home. The writer chooses the file-backed copy from Home if they want to keep working. Rationale: the file-backed and localStorage entries are different storage paths; auto-bridging hides where their data now lives.
4. **Vault constraint:** No Vault code. Reservation = listProjects must continue to ignore any workspace entry that is not a `.writeros` package (covers `_vault/`), and removeProject must not touch a `vault/` subfolder inside a package (already true because we remove the whole package on delete, and the package is gone after that).

---

## File Structure

**Create:**

- `client/src/lib/migrateLocalStorageToFolder.ts` — pure coordinator function; takes an adapter, returns `MigrationResult[]`. No React, no UI.
- `client/src/components/home/MigrateLocalStorageModal.tsx` — confirm modal. Lists unmigrated projects, shows count, exposes Migrate / Cancel.
- `tests/lib/migrateLocalStorageToFolder.test.ts` — unit tests for the coordinator with a fake adapter.
- `tests/components/MigrateLocalStorageModal.test.tsx` — modal render + interaction tests.

**Modify:**

- `client/src/lib/projectLibrary.ts` — add `migratedToFolder?: { folderLabel: string; packageName: string; migratedAt: string }` to `StoredProject`; add `markProjectsMigrated`, `getUnmigratedProjects`; filter migrated projects from `loadActiveProjectLibrary`'s "active" return and from active-id resolution.
- `client/src/lib/useWriterOSProjectsFolder.ts` — add `runMigration(projects: StoredProject[]): Promise<MigrationResult[]>` that requires folder permission, instantiates the adapter, calls `migrateLocalStorageToFolder`, then refreshes the project list.
- `client/src/components/home/HomeSurface.tsx` — render `MigrateLocalStorageModal` when a folder is connected and unmigrated localStorage projects exist; expose a `Migrate localStorage projects` affordance in the storage status row so the writer can re-trigger after dismiss.
- `client/src/App.tsx` — after migration completes, mark migrated projects in localStorage state, refresh both libraries, and (per Decision 3) clear active id if the active project was migrated.
- `tests/lib/projectLibrary.test.ts` — extend to cover `markProjectsMigrated`, `getUnmigratedProjects`, and the active-library filter.
- `tests/lib/useWriterOSProjectsFolder.test.tsx` — extend to cover `runMigration` happy path + permission-denied path.
- `tests/lib/projectStorage.test.ts` — add regression test that `_vault/` at workspace root is ignored (not listed as a project, not flagged corrupt).
- `tests/components/HomeSurface.test.tsx` — extend to cover modal appearance when unmigrated projects exist and folder is connected; cover dismiss + re-open from status row.

---

## Task 1 — Add `migratedToFolder` field to `StoredProject` and library helpers

**Files:**
- Modify: `client/src/lib/projectLibrary.ts`
- Test: `tests/lib/projectLibrary.test.ts`

- [x] **Step 1.1: Write failing test for `migratedToFolder` round-trip in `readProjectLibrary`/`writeProjectLibrary`**

Append to `tests/lib/projectLibrary.test.ts`:

```ts
import { loadActiveProjectLibrary, summarizeProjects } from '../../client/src/lib/projectLibrary'

describe('migratedToFolder marker', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a migrated marker through readProjectLibrary', () => {
    const stored = [
      {
        id: 'p1',
        createdAt: 1,
        updatedAt: 2,
        state: defaultStateFixture(),
        migratedToFolder: {
          folderLabel: 'MyDocs',
          packageName: 'Project (abc12345).writeros',
          migratedAt: '2026-05-25T12:00:00.000Z',
        },
      },
    ]
    localStorage.setItem('writeros_project_library', JSON.stringify(stored))

    const summaries = summarizeProjects(readLibraryForTest())
    expect(summaries[0]).toMatchObject({ id: 'p1' })
    expect(readLibraryForTest()[0].migratedToFolder).toEqual({
      folderLabel: 'MyDocs',
      packageName: 'Project (abc12345).writeros',
      migratedAt: '2026-05-25T12:00:00.000Z',
    })
  })
})
```

If `readProjectLibrary` is not exported, export it as a test-only helper (or add `readLibraryForTest` re-export) — match how other library tests access internals.

- [x] **Step 1.2: Run the test and verify it fails**

Run: `npm run test:run -- tests/lib/projectLibrary.test.ts`
Expected: FAIL with `migratedToFolder` missing on the parsed entry.

- [x] **Step 1.3: Add the field**

In `client/src/lib/projectLibrary.ts`:

```ts
export interface StoredProject {
  id: string
  createdAt: number
  updatedAt: number
  state: ProjectState
  archivedAt?: string
  migratedToFolder?: {
    folderLabel: string
    packageName: string
    migratedAt: string
  }
}
```

Update `readProjectLibrary` to preserve the field when present (validate `folderLabel`, `packageName`, `migratedAt` are strings; otherwise drop the field):

```ts
const migratedToFolder =
  candidate.migratedToFolder &&
  typeof candidate.migratedToFolder === 'object' &&
  typeof candidate.migratedToFolder.folderLabel === 'string' &&
  typeof candidate.migratedToFolder.packageName === 'string' &&
  typeof candidate.migratedToFolder.migratedAt === 'string'
    ? {
        folderLabel: candidate.migratedToFolder.folderLabel,
        packageName: candidate.migratedToFolder.packageName,
        migratedAt: candidate.migratedToFolder.migratedAt,
      }
    : undefined
```

And include `...(migratedToFolder ? { migratedToFolder } : {})` in the returned object alongside `archivedAt`.

`writeProjectLibrary` already spreads the full project; verify the field survives.

- [x] **Step 1.4: Run the test and verify it passes**

Run: `npm run test:run -- tests/lib/projectLibrary.test.ts`
Expected: PASS.

- [x] **Step 1.5: Commit**

```bash
git add client/src/lib/projectLibrary.ts tests/lib/projectLibrary.test.ts
git commit -m "feat(storage): add migratedToFolder marker to StoredProject"
```

---

## Task 2 — Filter migrated projects from the active library

**Files:**
- Modify: `client/src/lib/projectLibrary.ts`
- Test: `tests/lib/projectLibrary.test.ts`

- [x] **Step 2.1: Write failing tests**

Append:

```ts
describe('loadActiveProjectLibrary with migrated projects', () => {
  beforeEach(() => localStorage.clear())

  it('does not activate a migrated project on reload', () => {
    const migrated = makeStoredProject({
      id: 'p1',
      migratedToFolder: { folderLabel: 'F', packageName: 'P.writeros', migratedAt: 'now' },
    })
    const active = makeStoredProject({ id: 'p2' })
    localStorage.setItem('writeros_project_library', JSON.stringify([migrated, active]))
    localStorage.setItem('writeros_active_project_id', 'p1')

    const result = loadActiveProjectLibrary()
    expect(result.activeProjectId).toBe('')
    expect(result.projects.map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('summarizeProjects(unmigrated only) excludes migrated entries', () => {
    const migrated = makeStoredProject({
      id: 'p1',
      migratedToFolder: { folderLabel: 'F', packageName: 'P.writeros', migratedAt: 'now' },
    })
    const active = makeStoredProject({ id: 'p2' })
    const unmigrated = projectsForActiveLibrary([migrated, active])
    expect(unmigrated.map(p => p.id)).toEqual(['p2'])
  })
})
```

- [x] **Step 2.2: Run, see failures**

Run: `npm run test:run -- tests/lib/projectLibrary.test.ts`
Expected: FAIL — either `projectsForActiveLibrary` is undefined or `activeProjectId` is `p1`.

- [x] **Step 2.3: Implement filter helpers**

In `projectLibrary.ts`:

```ts
export function projectsForActiveLibrary(projects: StoredProject[]): StoredProject[] {
  return projects.filter(project => !project.migratedToFolder)
}
```

In `loadActiveProjectLibrary`, replace the existing active-id resolution so it considers only non-migrated, non-archived projects when choosing fallback active, and refuses to activate a migrated project even if the stored active id matches one. Specifically, after computing `projects`:

```ts
const activeCandidates = projects.filter(p => !p.migratedToFolder && !p.archivedAt)
const storedActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
const storedActive = projects.find(p => p.id === storedActiveId)

if (storedActive?.migratedToFolder) {
  localStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
  return { activeProjectId: '', state: defaultProjectState(), projects }
}
```

Make sure the existing "all archived" and "persisted as []" paths still return the same shapes — do not change them.

- [x] **Step 2.4: Run, see green**

Run: `npm run test:run -- tests/lib/projectLibrary.test.ts`
Expected: PASS for the new tests; existing tests still pass.

- [x] **Step 2.5: Commit**

```bash
git add client/src/lib/projectLibrary.ts tests/lib/projectLibrary.test.ts
git commit -m "feat(storage): hide migrated projects from active library selection"
```

---

## Task 3 — `markProjectsMigrated` + `getUnmigratedProjects` helpers

**Files:**
- Modify: `client/src/lib/projectLibrary.ts`
- Test: `tests/lib/projectLibrary.test.ts`

- [x] **Step 3.1: Write failing tests**

```ts
describe('markProjectsMigrated', () => {
  beforeEach(() => localStorage.clear())

  it('stamps a migrated marker and writes back', () => {
    const projects = [makeStoredProject({ id: 'p1' }), makeStoredProject({ id: 'p2' })]
    localStorage.setItem('writeros_project_library', JSON.stringify(projects))

    const result = markProjectsMigrated(projects, [
      { projectId: 'p1', folderLabel: 'F', packageName: 'P.writeros', migratedAt: 'now' },
    ])

    expect(result.find(p => p.id === 'p1')?.migratedToFolder?.packageName).toBe('P.writeros')
    expect(result.find(p => p.id === 'p2')?.migratedToFolder).toBeUndefined()
    const persisted = JSON.parse(localStorage.getItem('writeros_project_library')!)
    expect(persisted.find((p: any) => p.id === 'p1').migratedToFolder.packageName).toBe('P.writeros')
  })
})

describe('getUnmigratedProjects', () => {
  it('returns only entries without a migratedToFolder marker', () => {
    const projects = [
      makeStoredProject({ id: 'p1', migratedToFolder: { folderLabel: 'F', packageName: 'P', migratedAt: 'now' } }),
      makeStoredProject({ id: 'p2' }),
    ]
    expect(getUnmigratedProjects(projects).map(p => p.id)).toEqual(['p2'])
  })
})
```

- [x] **Step 3.2: Run, see failures**

Run: `npm run test:run -- tests/lib/projectLibrary.test.ts`
Expected: FAIL — helpers not exported.

- [x] **Step 3.3: Implement**

```ts
export interface MigrationMarker {
  projectId: string
  folderLabel: string
  packageName: string
  migratedAt: string
}

export function markProjectsMigrated(projects: StoredProject[], markers: MigrationMarker[]): StoredProject[] {
  const byId = new Map(markers.map(m => [m.projectId, m]))
  const next = projects.map(project => {
    const marker = byId.get(project.id)
    if (!marker) return project
    return {
      ...project,
      migratedToFolder: {
        folderLabel: marker.folderLabel,
        packageName: marker.packageName,
        migratedAt: marker.migratedAt,
      },
    }
  })
  writeProjectLibrary(next)
  return next
}

export function getUnmigratedProjects(projects: StoredProject[]): StoredProject[] {
  return projects.filter(project => !project.migratedToFolder)
}
```

- [x] **Step 3.4: Run, see green**

Run: `npm run test:run -- tests/lib/projectLibrary.test.ts`

- [x] **Step 3.5: Commit**

```bash
git add client/src/lib/projectLibrary.ts tests/lib/projectLibrary.test.ts
git commit -m "feat(storage): add markProjectsMigrated and getUnmigratedProjects helpers"
```

---

## Task 4 — `migrateLocalStorageToFolder` coordinator

**Files:**
- Create: `client/src/lib/migrateLocalStorageToFolder.ts`
- Test: `tests/lib/migrateLocalStorageToFolder.test.ts`

- [x] **Step 4.1: Write failing tests**

```ts
import { migrateLocalStorageToFolder, type MigrationResult } from '../../client/src/lib/migrateLocalStorageToFolder'
import type { ProjectStorageAdapter, ProjectStorageProjectRef } from '../../client/src/lib/projectStorage'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

function makeAdapter(overrides: Partial<ProjectStorageAdapter> = {}): ProjectStorageAdapter {
  const ref = (id: string): ProjectStorageProjectRef => ({
    id,
    packageName: `${id}.writeros`,
    summary: { id, title: id, createdAt: 0, updatedAt: 0 },
  })
  return {
    kind: 'fake',
    label: 'Fake',
    listProjects: async () => [],
    readProject: async () => ({ ok: true, project: {} as any, warnings: [] }),
    writeProject: async (project) => ref(project.id),
    removeProject: async () => ({ ok: true, folderAlreadyMissing: false }),
    archiveProject: async (r) => ({ ok: true, ref: r as any }),
    restoreProject: async (r) => ({ ok: true, ref: r as any }),
    ...overrides,
  } as ProjectStorageAdapter
}

describe('migrateLocalStorageToFolder', () => {
  it('writes each unmigrated project and returns a success result per project', async () => {
    const projects: StoredProject[] = [
      makeStoredProject({ id: 'p1' }),
      makeStoredProject({ id: 'p2' }),
    ]
    const adapter = makeAdapter()
    const results = await migrateLocalStorageToFolder(adapter, projects, { folderLabel: 'MyDocs' })
    expect(results.map(r => ({ id: r.projectId, ok: r.ok }))).toEqual([
      { id: 'p1', ok: true },
      { id: 'p2', ok: true },
    ])
    expect(results[0]).toMatchObject({ ok: true, packageName: 'p1.writeros', folderLabel: 'MyDocs' })
  })

  it('skips projects that already have a migratedToFolder marker', async () => {
    const projects: StoredProject[] = [
      makeStoredProject({ id: 'p1', migratedToFolder: { folderLabel: 'F', packageName: 'p1.writeros', migratedAt: 'now' } }),
      makeStoredProject({ id: 'p2' }),
    ]
    const writeProject = vi.fn(async (p: StoredProject) => ({ id: p.id, packageName: `${p.id}.writeros`, summary: { id: p.id, title: p.id, createdAt: 0, updatedAt: 0 } }))
    const adapter = makeAdapter({ writeProject } as any)

    const results = await migrateLocalStorageToFolder(adapter, projects, { folderLabel: 'MyDocs' })
    expect(writeProject).toHaveBeenCalledTimes(1)
    expect(writeProject.mock.calls[0][0].id).toBe('p2')
    expect(results.map(r => r.projectId)).toEqual(['p2'])
  })

  it('isolates per-project failures and continues with the rest', async () => {
    const projects: StoredProject[] = [
      makeStoredProject({ id: 'p1' }),
      makeStoredProject({ id: 'p2' }),
    ]
    const writeProject = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('disk full') })
      .mockImplementationOnce(async (p: StoredProject) => ({ id: p.id, packageName: `${p.id}.writeros`, summary: { id: p.id, title: p.id, createdAt: 0, updatedAt: 0 } }))
    const adapter = makeAdapter({ writeProject } as any)

    const results = await migrateLocalStorageToFolder(adapter, projects, { folderLabel: 'F' })
    expect(results).toEqual([
      { projectId: 'p1', ok: false, error: 'disk full' },
      expect.objectContaining({ projectId: 'p2', ok: true }),
    ])
  })
})
```

- [x] **Step 4.2: Run, see failures**

Run: `npm run test:run -- tests/lib/migrateLocalStorageToFolder.test.ts`
Expected: FAIL — module not found.

- [x] **Step 4.3: Implement**

`client/src/lib/migrateLocalStorageToFolder.ts`:

```ts
import type { ProjectStorageAdapter } from './projectStorage'
import type { StoredProject } from './projectLibrary'

export type MigrationResult =
  | { projectId: string; ok: true; packageName: string; folderLabel: string; migratedAt: string }
  | { projectId: string; ok: false; error: string }

export interface MigrationOptions {
  folderLabel: string
  now?: () => string
}

export async function migrateLocalStorageToFolder(
  adapter: ProjectStorageAdapter,
  projects: StoredProject[],
  options: MigrationOptions,
): Promise<MigrationResult[]> {
  const now = options.now ?? (() => new Date().toISOString())
  const results: MigrationResult[] = []

  for (const project of projects) {
    if (project.migratedToFolder) continue
    try {
      const ref = await adapter.writeProject(project)
      results.push({
        projectId: project.id,
        ok: true,
        packageName: ref.packageName,
        folderLabel: options.folderLabel,
        migratedAt: now(),
      })
    } catch (error) {
      results.push({
        projectId: project.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
```

- [x] **Step 4.4: Run, see green**

Run: `npm run test:run -- tests/lib/migrateLocalStorageToFolder.test.ts`
Expected: PASS.

- [x] **Step 4.5: Commit**

```bash
git add client/src/lib/migrateLocalStorageToFolder.ts tests/lib/migrateLocalStorageToFolder.test.ts
git commit -m "feat(storage): add migrateLocalStorageToFolder coordinator"
```

---

## Task 5 — `runMigration` on `useWriterOSProjectsFolder`

**Files:**
- Modify: `client/src/lib/useWriterOSProjectsFolder.ts`
- Test: `tests/lib/useWriterOSProjectsFolder.test.tsx`

- [x] **Step 5.1: Write failing tests**

Add to `tests/lib/useWriterOSProjectsFolder.test.tsx`:

```ts
it('runMigration writes each project via adapter and returns results', async () => {
  const { result } = renderHook(() => useWriterOSProjectsFolder())
  await act(async () => {
    await connectFakeFolder(result, { handle: makeGrantedFakeHandle('MyDocs') })
  })
  const projects = [makeStoredProject({ id: 'p1' }), makeStoredProject({ id: 'p2' })]

  let migrationResults: any[] = []
  await act(async () => {
    migrationResults = await result.current.runMigration(projects)
  })

  expect(migrationResults).toHaveLength(2)
  expect(migrationResults.every((r: any) => r.ok)).toBe(true)
  expect(result.current.label).toBe('MyDocs')
})

it('runMigration surfaces permission-denied as a single failure result', async () => {
  const { result } = renderHook(() => useWriterOSProjectsFolder())
  await act(async () => {
    await connectFakeFolder(result, { handle: makeDeniedFakeHandle('MyDocs') })
  })
  const projects = [makeStoredProject({ id: 'p1' })]
  let migrationResults: any[] = []
  await act(async () => {
    migrationResults = await result.current.runMigration(projects)
  })
  expect(migrationResults).toEqual([
    { projectId: 'p1', ok: false, error: expect.stringMatching(/permission/i) },
  ])
})
```

Use the existing fake-handle helpers from the test file as templates.

- [x] **Step 5.2: Run, see failures**

Run: `npm run test:run -- tests/lib/useWriterOSProjectsFolder.test.tsx`
Expected: FAIL — `runMigration` is undefined.

- [x] **Step 5.3: Implement**

In `client/src/lib/useWriterOSProjectsFolder.ts`, add:

```ts
const runMigration = useCallback(async (projects: StoredProject[]): Promise<MigrationResult[]> => {
  let folderHandle: WriterOSFileSystemDirectoryHandle
  try {
    folderHandle = await requireFolderPermission()
  } catch (error) {
    return projects
      .filter(project => !project.migratedToFolder)
      .map(project => ({
        projectId: project.id,
        ok: false as const,
        error: errorMessageFromUnknown(error),
      }))
  }

  const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
  const results = await migrateLocalStorageToFolder(adapter, projects, {
    folderLabel: adapter.label,
  })

  // Refresh the project list so newly-migrated packages appear in folderProjects.
  const nextEntries = await adapter.listProjects()
  updateProjectRefs(nextEntries)
  const nextProjects = projectEntriesFromList(nextEntries)
  setLabel(adapter.label)
  setProjects(nextProjects.projects)
  setArchivedProjects(nextProjects.archivedProjects)
  setCorruptProjects(nextProjects.corruptProjects)
  setStatus('ready')
  setErrorMessage(null)

  return results
}, [requireFolderPermission, updateProjectRefs])
```

Return `runMigration` from the hook's exposed object.

- [x] **Step 5.4: Run, see green**

Run: `npm run test:run -- tests/lib/useWriterOSProjectsFolder.test.tsx`
Expected: PASS.

- [x] **Step 5.5: Commit**

```bash
git add client/src/lib/useWriterOSProjectsFolder.ts tests/lib/useWriterOSProjectsFolder.test.tsx
git commit -m "feat(storage): expose runMigration on useWriterOSProjectsFolder"
```

---

## Task 6 — `MigrateLocalStorageModal` component

**Files:**
- Create: `client/src/components/home/MigrateLocalStorageModal.tsx`
- Test: `tests/components/MigrateLocalStorageModal.test.tsx`

- [x] **Step 6.1: Write failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MigrateLocalStorageModal } from '../../client/src/components/home/MigrateLocalStorageModal'

describe('MigrateLocalStorageModal', () => {
  it('renders the project titles and the destination folder label', () => {
    render(
      <MigrateLocalStorageModal
        open
        projects={[
          { id: 'p1', title: 'Romeo' },
          { id: 'p2', title: 'Juliet' },
        ]}
        folderLabel="MyDocs"
        onMigrate={() => {}}
        onCancel={() => {}}
        migrating={false}
      />
    )
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/migrate.*projects/i)
    expect(screen.getByText('Romeo')).toBeInTheDocument()
    expect(screen.getByText('Juliet')).toBeInTheDocument()
    expect(screen.getByText(/MyDocs/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Migrate 2 projects/i })).toBeEnabled()
  })

  it('calls onMigrate when the migrate button is clicked', async () => {
    const onMigrate = vi.fn()
    render(
      <MigrateLocalStorageModal
        open
        projects={[{ id: 'p1', title: 'Romeo' }]}
        folderLabel="MyDocs"
        onMigrate={onMigrate}
        onCancel={() => {}}
        migrating={false}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /Migrate 1 project/i }))
    expect(onMigrate).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while migrating', () => {
    render(
      <MigrateLocalStorageModal
        open
        projects={[{ id: 'p1', title: 'Romeo' }]}
        folderLabel="MyDocs"
        onMigrate={() => {}}
        onCancel={() => {}}
        migrating
      />
    )
    expect(screen.getByRole('button', { name: /Migrating/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled()
  })
})
```

- [x] **Step 6.2: Run, see failures**

Run: `npm run test:run -- tests/components/MigrateLocalStorageModal.test.tsx`
Expected: FAIL — component does not exist.

- [x] **Step 6.3: Implement**

`client/src/components/home/MigrateLocalStorageModal.tsx`:

```tsx
import { useEffect, useRef } from 'react'

export interface MigrateLocalStorageProjectSummary {
  id: string
  title: string
}

export interface MigrateLocalStorageModalProps {
  open: boolean
  projects: MigrateLocalStorageProjectSummary[]
  folderLabel: string
  onMigrate: () => void
  onCancel: () => void
  migrating: boolean
}

export function MigrateLocalStorageModal({ open, projects, folderLabel, onMigrate, onCancel, migrating }: MigrateLocalStorageModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const count = projects.length
  const buttonLabel = migrating
    ? 'Migrating…'
    : `Migrate ${count} ${count === 1 ? 'project' : 'projects'}`

  return (
    <dialog ref={dialogRef} aria-labelledby="migrate-local-storage-title">
      <h2 id="migrate-local-storage-title">Migrate {count} browser project{count === 1 ? '' : 's'} to {folderLabel}</h2>
      <p>
        WriterOS found {count} project{count === 1 ? '' : 's'} stored in this browser.
        Copy them into <strong>{folderLabel}</strong> so they live as <code>.writeros</code> folders you can back up and reopen.
        The browser copies stay as a safety backup and stop appearing in the active list.
      </p>
      <ul>
        {projects.map(project => (
          <li key={project.id}>{project.title}</li>
        ))}
      </ul>
      <div>
        <button type="button" onClick={onCancel} disabled={migrating}>Cancel</button>
        <button type="button" onClick={onMigrate} disabled={migrating}>{buttonLabel}</button>
      </div>
    </dialog>
  )
}
```

Style with existing inline-style patterns used in `HomeSurface.tsx` for consistency.

- [x] **Step 6.4: Run, see green**

Run: `npm run test:run -- tests/components/MigrateLocalStorageModal.test.tsx`
Expected: PASS.

- [x] **Step 6.5: Commit**

```bash
git add client/src/components/home/MigrateLocalStorageModal.tsx tests/components/MigrateLocalStorageModal.test.tsx
git commit -m "feat(home): add MigrateLocalStorageModal confirm dialog"
```

---

## Task 7 — Wire modal into `HomeSurface` and `App.tsx`

**Files:**
- Modify: `client/src/components/home/HomeSurface.tsx`
- Modify: `client/src/App.tsx`
- Test: `tests/components/HomeSurface.test.tsx`

- [x] **Step 7.1: Write failing tests**

In `tests/components/HomeSurface.test.tsx`, add a describe block:

```tsx
describe('localStorage → folder migration prompt', () => {
  it('shows the migration modal when a folder is connected and unmigrated projects exist', () => {
    render(
      <HomeSurface
        {...baseHomeProps}
        projects={[
          { id: 'p1', title: 'Romeo', createdAt: 0, updatedAt: 0 },
          { id: 'p2', title: 'Juliet', createdAt: 0, updatedAt: 0 },
        ]}
        unmigratedProjects={[
          { id: 'p1', title: 'Romeo' },
          { id: 'p2', title: 'Juliet' },
        ]}
        storageStatus="ready"
        folderLabel="MyDocs"
      />
    )
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/migrate.*projects/i)
  })

  it('does not show the modal when no folder is connected', () => {
    render(
      <HomeSurface
        {...baseHomeProps}
        unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
        storageStatus="disconnected"
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not show the modal when there are no unmigrated projects', () => {
    render(
      <HomeSurface
        {...baseHomeProps}
        unmigratedProjects={[]}
        storageStatus="ready"
        folderLabel="MyDocs"
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking migrate calls onMigrateLocalStorage', async () => {
    const onMigrateLocalStorage = vi.fn()
    render(
      <HomeSurface
        {...baseHomeProps}
        unmigratedProjects={[{ id: 'p1', title: 'Romeo' }]}
        storageStatus="ready"
        folderLabel="MyDocs"
        onMigrateLocalStorage={onMigrateLocalStorage}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /Migrate 1 project/i }))
    expect(onMigrateLocalStorage).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 7.2: Run, see failures**

Run: `npm run test:run -- tests/components/HomeSurface.test.tsx`
Expected: FAIL — props not accepted.

- [x] **Step 7.3: Add the props and render the modal**

In `HomeSurface.tsx` add to the prop interface:

```ts
unmigratedProjects?: { id: string; title: string }[]
folderLabel?: string | null
onMigrateLocalStorage?: () => void
migratingLocalStorage?: boolean
```

In the component body, derive `showMigrationModal = storageStatus === 'ready' && (unmigratedProjects?.length ?? 0) > 0 && !migrationDismissed`, and render `<MigrateLocalStorageModal ... />`. Local state `migrationDismissed` (reset to `false` whenever `unmigratedProjects` or `storageStatus` changes such that the count would re-open the modal — implement as a `useEffect` keyed on `unmigratedProjects.length`).

Add a "Migrate browser projects" link in the storage status row (visible only when `unmigratedProjects.length > 0` and a folder is connected) that sets `migrationDismissed = false` to reopen the modal after a Cancel.

- [x] **Step 7.4: Run, see green**

Run: `npm run test:run -- tests/components/HomeSurface.test.tsx`
Expected: PASS for the new block; existing HomeSurface tests still pass.

- [x] **Step 7.5: Wire `App.tsx`**

In `App.tsx`:

1. Import `getUnmigratedProjects`, `markProjectsMigrated`, `summarizeProjects` from `projectLibrary`.
2. Compute `unmigratedProjects = useMemo(() => summarizeProjects(getUnmigratedProjects(project.projects)).map(p => ({ id: p.id, title: p.title })), [project.projects])`.
3. Add `migrating` local state.
4. Add `handleMigrateLocalStorage` that:
   - sets `migrating(true)`
   - awaits `projectFolder.runMigration(getUnmigratedProjects(project.projects))`
   - calls `markProjectsMigrated` with the successful results' `projectId`s
   - calls `project.reloadLibrary()` (add this method to `useProjectState` if not present — see Step 7.6) to pick up the updated localStorage
   - if the active project id was in the success list, calls `project.closeActiveProject()` (existing) or sets active id to `''` via the existing path
   - sets `migrating(false)`
   - shows a brief receipt of failures via the existing error toast surface if any failures exist (do NOT block the user)
5. Pass `unmigratedProjects`, `folderLabel: projectFolder.label`, `onMigrateLocalStorage: handleMigrateLocalStorage`, `migratingLocalStorage: migrating` to `HomeSurface`.

- [x] **Step 7.6: If `useProjectState` lacks `reloadLibrary`, add it**

If absent, the simplest path is to expose a reload that calls `loadActiveProjectLibrary()` and re-syncs the hook state. Mirror the existing patterns in `useProjectState.ts` (it already has setters for `projects` and `activeProjectId`). Add a test asserting that reload picks up a stored library mutation.

- [x] **Step 7.7: Run full suite**

Run: `npm run test:run`
Expected: PASS across the board. Fix any breakage caused by widened prop interfaces.

- [x] **Step 7.8: Commit**

```bash
git add client/src/components/home/HomeSurface.tsx client/src/App.tsx client/src/lib/useProjectState.ts tests/components/HomeSurface.test.tsx tests/lib/useProjectState.test.ts
git commit -m "feat(home): wire migration modal and run migration from App"
```

---

## Task 8 — Vault path reservation regression test

**Files:**
- Modify: `tests/lib/projectStorage.test.ts`

- [x] **Step 8.1: Write failing test**

Append:

```ts
describe('Vault path reservation (Slice 4)', () => {
  it('listProjects ignores _vault/ at the workspace root', async () => {
    const folder = createFakeDirectoryHandle('MyDocs', {
      'Project (abc12345).writeros': makePackageHandle('Project (abc12345).writeros'),
      '_vault': makeDirectoryHandle('_vault', {
        'craft-notes.md': makeFileHandle('craft-notes.md', '# notes'),
      }),
    })
    const adapter = createFileSystemAccessProjectStorageAdapter(folder)
    const entries = await adapter.listProjects()
    expect(entries.find(e => 'packageName' in (e as any) ? false : false)).toBeUndefined()
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('ready')
  })

  it('removeProject does not touch _vault/ at the workspace root', async () => {
    const vault = makeDirectoryHandle('_vault', { 'craft-notes.md': makeFileHandle('craft-notes.md', '# notes') })
    const folder = createFakeDirectoryHandle('MyDocs', {
      'Project (abc12345).writeros': makePackageHandle('Project (abc12345).writeros'),
      '_vault': vault,
    })
    const adapter = createFileSystemAccessProjectStorageAdapter(folder)
    const [entry] = await adapter.listProjects()
    if (entry.status !== 'ready') throw new Error('expected ready')
    await adapter.removeProject(entry.ref)
    // _vault still has its file
    expect(await vault.getFileHandle('craft-notes.md')).toBeTruthy()
  })
})
```

If the fake handle helpers in the file have different names, use the existing names; copy a working fixture from above in the same file.

- [x] **Step 8.2: Run, see green or failure**

Run: `npm run test:run -- tests/lib/projectStorage.test.ts`
Expected: PASS if the adapter already filters by `.writeros` extension at the workspace root and removes only the target package. FAIL means the adapter touched `_vault/` — fix the adapter (whitelist `.writeros` for project entries; never traverse non-`.writeros` entries at workspace root other than `Archive/`).

- [x] **Step 8.3: If fix needed** — no adapter fix was needed.

In `projectStorage.ts` `listProjects`, ensure the loop continues past entries whose names do not end with `WRITEROS_PACKAGE_EXTENSION` and are not the archive subfolder. In `removeProject`, ensure the only `removeEntry` call targets the specific package directory by name.

- [x] **Step 8.4: Commit**

```bash
git add tests/lib/projectStorage.test.ts client/src/lib/projectStorage.ts
git commit -m "test(storage): reserve _vault/ at workspace root and vault/ inside package (Slice 4)"
```

---

## Final Verification

- [x] **Run full test suite**

Run: `npm run test:run`
Expected: green.

- [x] **Run TypeScript check**

Run: `npm run check`
Expected: green.

- [x] **Run build**

Run: `npm run build`
Expected: green.

- [ ] **Manual QA** (browser, dev server)

1. Start fresh: clear localStorage and choose a folder. Confirm Home shows no migration modal.
2. With folder disconnected, create two browser projects. Reload — both appear as Local projects.
3. Reconnect / pick the folder. Migration modal appears listing the two projects and naming the folder.
4. Click Migrate. Modal shows "Migrating…", then closes. Folder lists the two projects as `.writeros` packages.
5. Refresh. Folder still has the projects. localStorage "Local projects" count is now 0 (migrated projects hidden). The active session, if it was on one of the migrated projects, has returned to Home.
6. Permission-denied case: revoke folder permission, click "Migrate browser projects" — receive a clear error, no localStorage marker added.
7. Add a `_vault/` folder manually in Finder. Reload Home. It is not surfaced as a project or as a corrupt entry.

- [x] **Push branch and open PR (do not merge)**

```bash
git push -u origin slice-4-storage-migration
gh pr create --base main --head slice-4-storage-migration --title "Slice 4: External storage migration (localStorage → folder)" --body "$(cat <<'EOF'
## Summary

- Adds a one-confirm migration flow that copies every localStorage-backed project into the user-selected folder as `.writeros` packages.
- Stamps a non-destructive `migratedToFolder` marker on each migrated localStorage entry so the active library hides them while keeping a safety backup on disk.
- Active project preserved per Decision 3: if the active project was migrated, the session returns to Home and the writer reopens the file-backed copy explicitly.
- Reserves Vault paths (`vault/` inside packages, `_vault/` at workspace root) via regression tests; no Vault implementation in this PR.

## Test plan

- [x] `npm run test:run`
- [x] `npm run check`
- [x] `npm run build`
- [ ] Manual QA per the plan's Final Verification section.

Do not merge without explicit confirmation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage:**
  - "Migrate localStorage project library into project folders" → Tasks 4, 5, 7.
  - "Preserve active project" → Task 7 + Decision 3.
  - "Add recovery behavior for missing folder permissions" → Task 5 (permission-denied test) + existing `permission-needed` status surfacing.
  - "Confirm localStorage fallback still works in browser-preview mode" → existing `unsupported` branch; covered by existing tests that still must pass at Final Verification.
  - "Detect existing localStorage projects" → Task 3 `getUnmigratedProjects` + Task 7 derivation.
  - "Offer to migrate after explicit confirmation" → Task 6 modal + Task 7 wiring.
  - "Preserve project ids where safe" → `writeProject(project)` keeps `project.id` and the adapter encodes it in `packageName`.
  - "Leave localStorage untouched until migration succeeds" → Task 4 only writes a success result if `writeProject` resolves; Task 7 only calls `markProjectsMigrated` for `ok: true` results.
  - "Mark migrated projects" → Tasks 1, 3, 7.
  - "Failed writes must not corrupt existing project folders" → adapter `writeProject` is per-package; per-project failure isolation in Task 4.
  - "The shipped app does not depend on browser localStorage as the primary storage path" → after migration, active library is empty on the localStorage side; folder list is primary.
  - Vault PRD constraint (reserve `vault/`, `_vault/`) → Task 8.

- **Placeholder scan:** none — every code block is complete and concrete.

- **Type consistency:** `MigrationResult` shape is identical across Tasks 4, 5, 7. `migratedToFolder` shape is identical across Tasks 1, 3, 7. `MigrateLocalStorageProjectSummary` is the single summary shape passed through HomeSurface → Modal.
