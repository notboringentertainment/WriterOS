# Server-Backed Project Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WriterOS load, open, and save real `.writeros` projects through its local Express server so Codex's in-app browser can operate WriterOS without a native folder picker.

**Architecture:** When `WRITEROS_PROJECTS_ROOT` points to one absolute local directory, same-origin WriterOS uses a guarded server project API as primary storage. The existing File System Access adapter and `showDirectoryPicker()` remain fallback behavior when server storage is disabled. Server accepts project ids, never client paths; it scans one canonical root, rejects symlinks and escapes, and replaces project packages through a staged sibling-directory swap.

**Tech Stack:** React 18, Vite, TypeScript, Express 4, Node `fs/promises`, Zod, Vitest, Testing Library.

**Spec:** `docs/product/app-home-import-storage-prd.md`

## Global Constraints

- Project packages remain durable source of truth: one `.writeros` package per project with ordinary, recoverable files.
- Server mode is primary only when `WRITEROS_PROJECTS_ROOT` is configured and valid; File System Access stays fallback.
- V1 server scope is one writable root. Multi-root, iCloud/Obsidian writes, phone/LAN access, cloud sync, and collaboration stay out.
- Data operations are list, read, and save/upsert. Archive, restore, delete, duplicate, and reveal get no server endpoints in this slice.
- Existing localStorage migration code remains. Do not create another migration system. Evidence from browser QA: in-app-browser storage currently contains projects, so localStorage cannot be deleted yet.
- API accepts `projectId` and a validated `StoredProject`; it never accepts an absolute path, relative path, or package path from client.
- Server binds to loopback. Every project-library data request also requires allowed same-origin `Origin` plus per-launch token. Do not enable CORS.
- Canonicalize configured root with `realpath()`. Use `lstat()` and `realpath()` on discovered targets; reject symlinks and any relative containment result beginning with `..` or becoming absolute.
- Save complete package using staging directory and rename swap. Existing package must remain untouched when staging fails; rollback must restore backup if swap fails.
- Preserve current user changes: do not edit or discard dirty `AGENTS.md` or `supabase/.temp/`.
- Outstanding `createPersonaSystemPrompt` P2 review remains separate work and must land or be explicitly closed before Task 1. Finding text is not present in this worktree, so this plan does not invent its fix.

## File Structure

- Create `shared/projectLibraryApi.ts`: network DTOs and Zod request/response schemas.
- Create `server/projectLibrary/config.ts`: environment parsing, canonical root initialization, allowed-origin construction, launch token.
- Create `server/projectLibrary/store.ts`: guarded filesystem scan/read/staged-write implementation.
- Create `server/projectLibrary/routes.ts`: bootstrap/list/read/save route handlers and request security middleware.
- Modify `server/routes.ts`: register project-library routes before existing app routes.
- Modify `client/src/lib/projectStorage.ts`: allow `server` adapter kind and declare per-operation capabilities.
- Create `client/src/lib/serverProjectStorage.ts`: bootstrap client and server-backed `ProjectStorageAdapter`.
- Create `client/src/lib/useWriterOSProjectLibrary.ts`: choose configured server adapter first, existing folder hook second.
- Modify `client/src/App.tsx`: consume general project-library hook while preserving open/new/import/autosave flows.
- Modify `client/src/components/home/HomeSurface.tsx`: render server-connected status and hide unsupported lifecycle actions.
- Create `tests/server/projectLibraryStore.test.ts`: root, scan, read, symlink, atomic-write, rollback coverage.
- Create `tests/server/projectLibraryRoutes.test.ts`: origin/token/DTO/HTTP contract coverage.
- Create `tests/lib/serverProjectStorage.test.ts`: client adapter contract coverage.
- Create `tests/lib/useWriterOSProjectLibrary.test.tsx`: server-primary and picker-fallback selection coverage.
- Modify `tests/components/HomeSurface.test.tsx`: server status and capability-driven controls.
- Modify focused App storage tests found by `rg -l 'useWriterOSProjectsFolder|activeProjectStorage' tests/components tests/lib`: preserve open/new/import/autosave behavior under server mode.

---

### Task 0: Close Sequencing And Baseline Gates

**Files:**
- No storage files changed.

**Interfaces:**
- Consumes: current branch and pending P2 review finding.
- Produces: clean, recorded baseline before storage work.

- [ ] **Step 1: Resolve separate P2 gate**

Obtain exact `createPersonaSystemPrompt` P2 finding from its review source. Apply and commit that fix separately, or record reviewer confirmation that no change is required. Do not mix it into storage commits.

- [ ] **Step 2: Record protected dirty files**

Run:

```bash
git status --short
```

Expected protected entries:

```text
 M AGENTS.md
?? supabase/.temp/
```

- [ ] **Step 3: Run storage baseline**

Run:

```bash
npx vitest run tests/lib/projectStorage.test.ts tests/lib/useWriterOSProjectsFolder.test.tsx tests/components/HomeSurface.test.tsx
npm run check
```

Expected: PASS. If baseline fails, stop and record pre-existing failure before implementation.

### Task 1: Build Guarded Filesystem Store

**Files:**
- Create: `server/projectLibrary/config.ts`
- Create: `server/projectLibrary/store.ts`
- Create: `tests/server/projectLibraryStore.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProjectLibraryConfig {
  enabled: boolean
  rootPath: string | null
  label: string | null
  allowedOrigins: ReadonlySet<string>
  sessionToken: string
}

export interface ServerProjectRef extends ProjectStorageProjectRef {
  kind: 'server'
}

export interface ProjectLibraryStore {
  label: string
  listProjects(): Promise<Array<ProjectStorageListEntry<ServerProjectRef>>>
  readProject(projectId: string): Promise<ProjectPackageReadResult>
  writeProject(project: StoredProject): Promise<ServerProjectRef>
}

export async function loadProjectLibraryConfig(env: NodeJS.ProcessEnv): Promise<ProjectLibraryConfig>
export async function createProjectLibraryStore(rootPath: string): Promise<ProjectLibraryStore>
```

- [ ] **Step 1: Write failing config and containment tests**

Cover exact behavior:

```ts
it('disables server storage when WRITEROS_PROJECTS_ROOT is absent')
it('rejects a configured root that is relative or not a directory')
it('canonicalizes the configured root and exposes only its basename as label')
it('generates a 256-bit base64url session token')
it('allows only loopback origins for configured HOST and PORT')
```

Run:

```bash
npx vitest run tests/server/projectLibraryStore.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 2: Implement configuration**

Use `randomBytes(32).toString('base64url')`. Accept only absolute roots. Resolve root once with `realpath()`, verify `stat().isDirectory()`, and derive label with `basename()`.

Allowed origins for port `5177`:

```ts
new Set([
  'http://127.0.0.1:5177',
  'http://localhost:5177',
  'http://[::1]:5177',
])
```

- [ ] **Step 3: Write failing list/read security tests**

Build fixtures under `mkdtemp()` only. Cover:

```ts
it('lists valid root-level writeros packages and corrupt-package warnings')
it('ignores non-writeros entries and Archive in this slice')
it('reads a project by manifest projectId rather than client path')
it('returns not-found when projectId is unknown')
it('rejects a symlinked writeros package even when its target exists')
it('rejects a candidate whose real path escapes canonical root')
```

- [ ] **Step 4: Implement scan and read**

Reuse `readWriterOSProjectPackage()` and package path constants. Scan direct root children only. Never follow symlinks. Build internal `Map<projectId, canonicalPackagePath>` from validated manifests; rebuild map during each list and on read miss so Finder changes remain discoverable.

- [ ] **Step 5: Write failing staged-write tests**

Cover:

```ts
it('creates a new package using the canonical package name')
it('updates an existing package found by projectId')
it('renames a package when title changes')
it('leaves existing package byte-identical when staging write fails')
it('restores backup when final rename fails')
it('never writes through an existing symlink target')
```

- [ ] **Step 6: Implement staged package swap**

Algorithm:

```text
serialize complete package
create sibling staging directory with mkdtemp(root/.writeros-stage-)
write every allowed package file beneath staging
validate staging by reading it through readWriterOSProjectPackage
if destination exists: rename destination to unique sibling backup
rename staging to destination
remove backup only after successful destination rename
on failure: remove staging; restore backup when destination is absent
```

Allowed write paths come only from `serializeWriterOSProjectPackage().files`; reject absolute keys and keys containing `..`. Before creating each parent, verify its resolved existing ancestor stays inside canonical root.

- [ ] **Step 7: Verify and commit store**

Run:

```bash
npx vitest run tests/server/projectLibraryStore.test.ts
npm run check
git add server/projectLibrary/config.ts server/projectLibrary/store.ts tests/server/projectLibraryStore.test.ts
git commit -m "feat(storage): add guarded server project store"
```

### Task 2: Expose Secure Bootstrap/List/Read/Save API

**Files:**
- Create: `shared/projectLibraryApi.ts`
- Create: `server/projectLibrary/routes.ts`
- Modify: `server/routes.ts`
- Create: `tests/server/projectLibraryRoutes.test.ts`

**Interfaces:**
- Consumes: `ProjectLibraryConfig`, `ProjectLibraryStore`.
- Produces:

```text
GET /api/project-library/bootstrap
GET /api/project-library/projects
GET /api/project-library/projects/:projectId
PUT /api/project-library/projects/:projectId
```

Bootstrap response:

```ts
type ProjectLibraryBootstrap =
  | { enabled: false }
  | { enabled: true; label: string; sessionToken: string }
```

Data requests require `X-WriterOS-Session: <sessionToken>`. Save body is `{ project: StoredProject }`; route rejects when URL id differs from `project.id`.

- [ ] **Step 1: Write failing API-schema tests**

Schemas must reject empty ids, mismatched ids, path fields, malformed state, non-finite timestamps, and extra top-level save-body keys.

- [ ] **Step 2: Implement shared DTO schemas**

Use strict Zod objects for network envelopes. Normalize incoming state with existing `migrateState()` only after envelope checks. Validate resulting project by `serializeWriterOSProjectPackage()` followed by `readWriterOSProjectPackage()` before store write.

- [ ] **Step 3: Write failing route security tests**

Start Express on port `0`, following `tests/server/personaCapabilityRoute.test.ts`. Cover:

```ts
it('returns enabled false without revealing paths when root is disabled')
it('bootstrap reveals label and token but never rootPath')
it('rejects missing, null, foreign, and non-loopback Origin values on data routes')
it('rejects missing and incorrect X-WriterOS-Session tokens')
it('does not emit Access-Control-Allow-Origin')
it('lists, reads, creates, and updates through authenticated same-origin requests')
it('returns 400 for id mismatch, 404 for unknown project, and 409 for name collision')
```

- [ ] **Step 4: Implement route module**

Register bootstrap without token requirement; it is readable only through browser same-origin policy. Require exact allowed `Origin` and `X-WriterOS-Session` on all data routes. Use constant-time token comparison. Set `Cache-Control: no-store` on bootstrap and data responses. Return stable JSON errors without filesystem paths.

- [ ] **Step 5: Register routes**

In `registerRoutes(app)`, load config once and register project-library routes before other handlers. A missing/invalid configured root must log one startup diagnostic and expose `{ enabled: false }`; it must not crash unrelated WriterOS features.

- [ ] **Step 6: Verify and commit API**

Run:

```bash
npx vitest run tests/server/projectLibraryRoutes.test.ts tests/server/projectLibraryStore.test.ts
npm run check
git add shared/projectLibraryApi.ts server/projectLibrary/routes.ts server/routes.ts tests/server/projectLibraryRoutes.test.ts
git commit -m "feat(storage): expose secure local project API"
```

### Task 3: Add Server Project Storage Adapter

**Files:**
- Modify: `client/src/lib/projectStorage.ts`
- Create: `client/src/lib/serverProjectStorage.ts`
- Create: `tests/lib/serverProjectStorage.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProjectStorageCapabilities {
  chooseFolder: boolean
  remove: boolean
  archive: boolean
  restore: boolean
  reveal: boolean
  duplicate: boolean
}

export interface ServerProjectRef extends ProjectStorageProjectRef {
  kind: 'server'
}

export async function bootstrapServerProjectStorage(): Promise<
  | { enabled: false }
  | { enabled: true; adapter: ProjectStorageAdapter<ServerProjectRef> }
>
```

`ProjectStorageAdapter.kind` becomes `'file-system-access' | 'server'`. Existing adapter reports current capabilities. Server adapter reports list/read/write support and false for lifecycle capabilities; unsupported methods return current typed `unsupported` results without making HTTP calls.

- [ ] **Step 1: Write failing adapter tests**

Mock `fetch` and cover disabled bootstrap, token forwarding, list mapping, read mapping, write/upsert, stable HTTP errors, and absence of lifecycle HTTP calls.

- [ ] **Step 2: Implement fetch client**

Keep token only in module memory. Every data call includes:

```ts
{
  'Content-Type': 'application/json',
  'X-WriterOS-Session': sessionToken,
}
```

Do not store token in localStorage, IndexedDB, URL, or logs.

- [ ] **Step 3: Verify existing adapter compatibility**

Run:

```bash
npx vitest run tests/lib/serverProjectStorage.test.ts tests/lib/projectStorage.test.ts
npm run check
git add client/src/lib/projectStorage.ts client/src/lib/serverProjectStorage.ts tests/lib/serverProjectStorage.test.ts
git commit -m "feat(storage): add server project adapter"
```

### Task 4: Make Server Storage Primary And Picker Fallback

**Files:**
- Create: `client/src/lib/useWriterOSProjectLibrary.ts`
- Create: `tests/lib/useWriterOSProjectLibrary.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/home/HomeSurface.tsx`
- Modify: `tests/components/HomeSurface.test.tsx`
- Modify: focused App tests returned by `rg -l 'useWriterOSProjectsFolder|activeProjectStorage' tests/components tests/lib`

**Interfaces:**
- Consumes: server adapter and existing `useWriterOSProjectsFolder()`.
- Produces: existing folder-hook public state plus:

```ts
source: 'server' | 'file-system-access'
capabilities: ProjectStorageCapabilities
```

- [ ] **Step 1: Write failing selection tests**

Cover:

```ts
it('selects configured server storage without opening a picker')
it('automatically scans server projects on mount')
it('falls back to useWriterOSProjectsFolder when bootstrap is disabled')
it('does not fall back after an authenticated server read or save error')
it('reuses existing migration coordinator with server adapter writeProject')
```

- [ ] **Step 2: Implement orchestration hook**

Always call both hooks to preserve React hook order. Select server result only after bootstrap resolves enabled. While bootstrap is pending, expose `loading`; when disabled, expose existing folder state unchanged. Once enabled, server remains selected until full page reload so transient errors cannot silently switch storage backends.

- [ ] **Step 3: Write failing Home capability tests**

In server mode, assert:

```text
Folder: WriterOS Projects
Managed by local WriterOS server
Open/New Project/Import remain available
Change Folder/Forget/Show in Folder/Duplicate/Archive/Delete are absent
```

In fallback mode, preserve current picker and lifecycle buttons.

- [ ] **Step 4: Integrate App without parallel save logic**

Replace `projectFolder` source with `projectLibrary` from new hook. Keep current folder-backed open/new/import/debounced-save code path; rename identifiers only where clarity requires. Continue using storage kind `'folder'` in UI-facing project rows because both implementations represent filesystem-backed projects. Route all actual operations through selected adapter and its capabilities.

- [ ] **Step 5: Preserve localStorage recovery**

Keep `getUnmigratedProjects`, `migrateLocalStorageToFolder`, and migration marker behavior. Server adapter's `writeProject()` is enough for existing coordinator. Do not delete browser entries or add a new migration format.

- [ ] **Step 6: Run focused integration tests**

Run:

```bash
npx vitest run tests/lib/useWriterOSProjectLibrary.test.tsx tests/lib/useWriterOSProjectsFolder.test.tsx tests/lib/serverProjectStorage.test.ts tests/components/HomeSurface.test.tsx
npm run check
```

Expected: server-primary and picker-fallback tests pass; existing folder tests remain unchanged.

- [ ] **Step 7: Commit client integration**

```bash
git add client/src/lib/useWriterOSProjectLibrary.ts client/src/App.tsx client/src/components/home/HomeSurface.tsx tests/lib/useWriterOSProjectLibrary.test.tsx tests/components/HomeSurface.test.tsx
git add client/src/lib/projectStorage.ts client/src/lib/serverProjectStorage.ts tests/lib/serverProjectStorage.test.ts
git commit -m "feat(storage): prefer local server project library"
```

### Task 5: Full Verification And Visible In-App Browser Proof

**Files:**
- No production files unless verification exposes a defect.
- Temporary E2E fixture: `work/writeros-project-library-e2e/` outside repository commits.

**Interfaces:**
- Consumes: completed server storage slice.
- Produces: proof that Codex in-app browser can open, edit, save, and reload a real package without `showDirectoryPicker()`.

- [ ] **Step 1: Run complete automated gate**

```bash
npm run test:run
npm run check
npm run build
```

Expected: all pass. Existing Vite chunk-size warning may remain; no new warnings.

- [ ] **Step 2: Create safe E2E fixture**

Copy `Grave Affairs (eea74df4).writeros` into `work/writeros-project-library-e2e/`, change copied manifest `projectId` and title to `WriterOS E2E`, and leave original package untouched. Validate copied package with store read tests before browser use.

- [ ] **Step 3: Start configured local stack**

```bash
WRITEROS_PROJECTS_ROOT="$PWD/work/writeros-project-library-e2e" npm run dev
```

Expected status:

```text
WriterOS ready on http://127.0.0.1:5177
```

- [ ] **Step 4: Verify through Codex in-app browser**

Open `http://127.0.0.1:5177/` in Codex in-app browser. Verify:

```text
Home automatically shows configured folder label
WriterOS E2E appears without Choose Folder
Open succeeds
Edit one harmless copied Synopsis field
Saved ✓ appears
Disk package changes inside E2E root
Full reload preserves edit
No browser console errors
Original Grave Affairs package hash remains unchanged
```

- [ ] **Step 5: Verify picker fallback**

Restart once without `WRITEROS_PROJECTS_ROOT`. Verify Home returns to current `Choose Folder` behavior and server bootstrap reports disabled.

- [ ] **Step 6: Final review and stop**

Review diff for root-path leaks, permissive CORS, token persistence, unguarded filesystem calls, unrelated refactors, and protected dirty-file changes. Stop after open/edit/save/reload proof. Create follow-up issues only when observed usage requires lifecycle endpoints.

## Stop Line

Slice is done when Codex in-app browser visibly opens and saves a copied `.writeros` project through server storage, full reload preserves edit, picker fallback still works, and full automated gate passes.

Do not add multi-root selection, Finder reveal, archive, restore, delete, duplicate, iCloud support, phone access, or browser-storage removal during this slice.
