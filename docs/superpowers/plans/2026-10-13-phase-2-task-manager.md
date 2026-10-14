# Phase 2 — Task manager: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every task-manager operation of the WEEEK public API callable — the 15 task operations the server lacks (comments, assignees, watchers, locations, parent, timers, time entries), full CRUD for projects, boards, columns, portfolios and tags, the workspace and the profile — as typed client methods and as MCP tools that take names, grouped into the `tasks` (default), `time` and `projects` toolsets, and release it as 0.6.0.

**Architecture:** Each operation is one registry entry (`src/operations.ts`), one method on its resource client (`src/api/*.ts`), and one tool in a toolset file (`src/tools/*.ts`); the contract test shrinks its Phase 2 block to zero. The resolver gains `tag` and `portfolio` kinds, a `search` loading strategy, and a `forget` method that write tools call so a thing created by one call resolves by name in the next. The default toolset grows from 12 to 24 tools (the task operations the API gained); timers and time entries go to a `time` toolset, everything project-level to `projects`.

**Tech Stack:** TypeScript 5 (NodeNext ESM, `.js` import suffixes), Node ≥ 18, `@modelcontextprotocol/sdk` ^1.0 (1.29 installed), `zod` ^3.23, `chrono-node` ^2.10, `vitest` 2, GitHub Actions (tag-triggered publish).

**Spec:** `docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md` — §3.3 (toolsets), §3.4 (tool naming and shape), §4 (name resolution, cache invalidation), §5 (testing), §6 Phase 2 row.

## Global Constraints

- **Never commit without the user's explicit go-ahead.** Each task ends with a commit step; stop before it, show `git status --short` and the message, and wait. Staging, tests, typecheck and build may run freely. A blanket "approve all" from the user covers branch commits only — never a push, a PR, a tag or a publish.
- **Never `npm publish` by hand.** Pushing a `v*` tag triggers CI, which verifies `package.json` version == tag, publishes to npm and the MCP registry, and attaches the `.mcpb`.
- **Prerequisite:** PR #5 (`feat/phase-1-foundation`, 0.5.0) is merged and tagged. This plan branches from `main` after that merge: `git checkout main && git pull && git checkout -b feat/phase-2-task-manager`.
- Node ≥ 18 (`engines`), ESM only, every relative import ends in `.js`. No new runtime dependencies.
- Conventional Commits (commitlint): `type(scope): imperative subject`, lowercase, no trailing period.
- English-only code and comments. Match the existing comment density (a sentence of *why* at non-obvious spots, nothing else).
- Tests live in `tests/` and mirror `src/` one-to-one; fixtures are synthetic JSON shaped by `spec/weeek-openapi.json`'s component schemas; a value used both to build and to assert is declared once.
- No token in CI, in tests, or in any log line. The server must still boot and list tools without `WEEEK_API_TOKEN`.
- **Existing tools change additively only.** The 13 tool names of 0.5.0 stay; every parameter they have today keeps its name, type and meaning; new parameters are optional. Descriptions may be reworded.
- **Tool naming and safety (spec §3.4):** `weeek_<verb>_<noun>`; a verb pair the API splits (archive/un-archive, start/stop timer) is one tool with a boolean; an add/remove pair is two tools; every tool that deletes, archives or detaches requires `confirm: true` (`z.literal(true)`) and carries `destructiveHint: true`. `tests/tool-quality.test.ts` enforces the pair for every tool whose name starts with `weeek_delete_`, `weeek_archive_`, `weeek_detach_` or `weeek_remove_`.
- Every reference parameter (project, board, column, member, tag, portfolio, parent portfolio) is `nameOrId`; an id passes through, a name resolves via `resolver.resolve`. Task ids and comment ids stay numeric ids, as in every existing tool.
- **Booleans the API wants as 0/1** (`isPrivate`, the `completed` and `all` query filters) are converted in the API layer or the tool that builds the query — never sent as `true`/`false`.
- The spec documents `day` on task create and `dueDate` on task update; the shipped code sends `dayFrom` for both and has done since 0.1 (verified live then). Keep `dayFrom`; the live smoke in Task 13 settles it and FOLLOWUPS records the outcome.
- Closed sets get closed types (`as const` + derived union); exhaustive branches end in a `never` check; options objects for ≥ 3 params or same-typed params; constants and types in separate files.
- `spec/`, `scripts/`, `tests/`, `docs/` are not shipped: `package.json` `files` stays `["dist"]`.

## Review Focus

1. **A PUT the API defines as a full replacement** (`PUT /ws/tags/{id}` needs `title` + `color`; `PUT /tm/projects/{id}` needs `name` + `isPrivate`; `PUT …/time-entries/{id}` needs all four fields). A user who passes only `color` expects the title to survive. Each update tool reads the current object and merges before sending. → tests in Tasks 10, 11, 12.
2. **Detaching a subtask**: `weeek_set_task_parent { id, parent: null }` must send `{"parentId": null}`, not omit the key — omitting it is the one shape the API rejects (`parentId` is required). → test in Task 3 (API) and Task 9 (tool).
3. **A destructive tool called without `confirm`** must be rejected by the schema before any client call, for all 11 new destructive tools, not only the ones a reviewer happens to check. → one test per tool in Tasks 9–12, plus the name-based sweep in `tests/tool-quality.test.ts` (Task 12).
4. **A board or column named without its scope**: `weeek_list_columns { board: "Main" }` with no `project` must fail with a message that names the missing scope, never silently list another project's "Main". → test in Task 8; resolver text restored in Task 7.
5. **A thing created, then named in the next call**: create project "Q4", then `weeek_create_task { project: "Q4" }` within 60 s. Today the cached project list is stale and resolution fails. Every write tool calls `resolver.forget` for the kinds it dirtied. → tests in Tasks 7 (forget), 11 and 12 (each write tool calls it).
6. **`all=true` and `completed=true` on `weeek_list_tasks`** must reach the wire as `1`, and `all` must be allowed to override `completed` as the API documents. → test in Task 8.

---

## File structure after Phase 2

```
src/operations.ts                 + 41 operations: user, workspace.get, tags, portfolios, projects, boards, columns, tasks (Task 2)
src/api/constants.ts              + taskPriorities, taskTypes, projectStatuses (Task 3, Task 5)
src/api/types.ts                  + TaskPriority, TaskType, TaskLocation, TimeEntry, TaskComment, TimeEntryFields,
                                    Project, ProjectStatus, NewProject, ProjectUpdate, Board, BoardColumn,
                                    Tag, TagUpdate, Portfolio, PortfolioQuery, PortfolioPage, Workspace, Profile;
                                    WeeekTask and NewTask grow; NamedEntity goes (Tasks 3, 5, 6)
src/api/priority.ts               priorityCode(name) / priorityName(code) (Task 3)
src/api/responses.ts              pickArray, toMember, toProfile; toNamed goes (Tasks 5, 6)
src/api/tasks.ts                  + comments, assignees, watchers, locations, parent (Task 3); timers, time entries (Task 4)
src/api/projects.ts · boards.ts · columns.ts   full CRUD, typed responses (Task 5)
src/api/tags.ts · portfolios.ts · user.ts      new (Task 6); workspace.ts + get() (Task 6)
src/client.ts                     + user, tags, portfolios (Task 6)
src/cache.ts                      + invalidatePrefix (Task 7)
src/resolver.ts                   IntegerKind | UuidKind, list/search strategy, tag + portfolio kinds, forget() (Task 7)
src/dates.ts                      parseDueDate → parseDay (Task 8)
src/tools/constants.ts            destructiveAnnotations (Task 8)
src/tools/inputs.ts               nameOrId, nameOrIdList, confirmation, taskId, page, dayMonthYear (Task 8)
src/tools/json-tool.ts            registerJsonTool — the try/jsonReply/catch/errorReply wrapper, written once (Task 8)
src/tools/tasks.ts                existing 12 tools (3 extended) + weeek_list_boards, weeek_list_columns (Task 8)
src/tools/comments.ts             3 comment tools (Task 9)
src/tools/task-links.ts           assignees, watchers, locations, parent — 7 tools (Task 9)
src/tools/time.ts                 the `time` toolset — 4 tools (Task 10)
src/tools/projects.ts             projects, boards, columns — 13 tools (Task 11)
src/tools/workspace.ts            portfolios, tags, workspace, profile — 12 tools (Task 12)
src/toolsets/constants.ts         toolsetNames = ["tasks", "time", "projects", "all"] (Tasks 10, 11)
src/toolsets/register.ts          registrars table: tasks (3 files), time, projects (2 files) (Tasks 9–12)
tests/helpers/tool-harness.ts     shared tool-test harness (Task 8)
tests/helpers/tool-names.ts       defaultToolNames, timeToolNames, projectToolNames, allToolNames (Tasks 8–12)
tests/api/responses.test.ts       pickArray, toMember, toProfile (Task 5, Task 6)
tests/api/{tags,portfolios,user}.test.ts   new (Task 6)
tests/tools/{comments,task-links,time,projects,workspace}.test.ts   new (Tasks 9–12)
README.md · docs/FOLLOWUPS.md · manifest.json · server.json · package.json (0.6.0)   (Task 13)
```

Tool inventory after Phase 2 — `tools/list` for `all` holds 54 tools (53 + `weeek_version`):

| Toolset | Tools | Count |
|---|---|---|
| `tasks` (default) | the 12 of 0.5.0 + `weeek_list_boards`, `weeek_list_columns`, `weeek_list_comments`, `weeek_add_comment`, `weeek_delete_comment`, `weeek_add_assignees`, `weeek_remove_assignees`, `weeek_add_watchers`, `weeek_remove_watchers`, `weeek_add_task_to_project`, `weeek_remove_task_from_project`, `weeek_set_task_parent` | 24 |
| `time` | `weeek_set_timer`, `weeek_add_time_entry`, `weeek_update_time_entry`, `weeek_delete_time_entry` | 4 |
| `projects` | `weeek_get_project`, `weeek_create_project`, `weeek_update_project`, `weeek_archive_project`, `weeek_delete_project`, `weeek_create_board`, `weeek_update_board`, `weeek_delete_board`, `weeek_move_board`, `weeek_create_column`, `weeek_update_column`, `weeek_delete_column`, `weeek_move_column`, `weeek_list_portfolios`, `weeek_get_portfolio`, `weeek_create_portfolio`, `weeek_update_portfolio`, `weeek_delete_portfolio`, `weeek_list_tags`, `weeek_get_tag`, `weeek_create_tag`, `weeek_update_tag`, `weeek_delete_tag`, `weeek_get_workspace`, `weeek_get_profile` | 25 |
| always | `weeek_version` | 1 |

Why `time` is its own toolset: the spec estimated the Phase 2 default at 18–20 tools and named timers + time entries as the first thing to carve out if it grew past that. With the 14 task operations the API gained the default would be 27; moving the four time-tracking tools out keeps it at 25 (24 + `weeek_version`) and keeps time tracking — a feature most task-only users never touch — out of every request's context.

---

### Task 1: Phase 2 entry list (FOLLOWUPS #20)

The small hygiene items the Phase 1 review deferred, done before the first new kind or toolset touches them. Nothing here changes behaviour.

**Files:**
- Modify: `src/config.ts` (type guard instead of `as ToolsetName[]`)
- Modify: `tests/spec.test.ts`, `tests/contract.test.ts` (OpenAPI's eight methods)
- Modify: `package.json` (clear `dist/` before build)
- Modify: `.github/workflows/test.yml`, `.github/workflows/release.yml` (bump the two actions off Node 20)
- Modify: `docs/FOLLOWUPS.md` (strike the four items; the remaining #20 items move to the tasks that own them — see the end of this task)

**Interfaces:**
- Consumes: `toolsetNames`, `ToolsetName` from `src/toolsets/{constants,types}.ts`.
- Produces: `isToolsetName(value: string): value is ToolsetName` in `src/config.ts`.

- [ ] **Step 1: Write the failing test for the type guard**

Append to `tests/config.test.ts`, inside `describe("WEEEK_TOOLSETS", …)`:

```ts
  it("keeps the parsed names typed without a cast", () => {
    const names = parseToolsets("tasks");
    // A name the guard did not admit cannot reach here; the array is a ToolsetName[] by construction.
    expect(names.every((name) => toolsetNames.includes(name))).toBe(true);
  });
```

and add `import { toolsetNames } from "../src/toolsets/constants.js";` at the top.

- [ ] **Step 2: Replace the cast in `src/config.ts`**

```ts
function isToolsetName(value: string): value is ToolsetName {
  return (toolsetNames as readonly string[]).includes(value);
}

export function parseToolsets(raw: string | undefined): ToolsetName[] {
  const names = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  if (names.length === 0) return [...defaultToolsets];
  const unknown = names.find((name) => !isToolsetName(name));
  if (unknown !== undefined) {
    throw new Error(`invalid config: WEEEK_TOOLSETS: unknown toolset "${unknown}"; valid values: ${toolsetNames.join(", ")}`);
  }
  return [...new Set(names.filter(isToolsetName))];
}
```

- [ ] **Step 3: Use OpenAPI's eight methods in the two spec-reading tests**

In `tests/contract.test.ts` replace `const methods = ["get", "post", "put", "patch", "delete"] as const;` with:

```ts
// OpenAPI's full method set, not only the ones the server calls today, so a HEAD or OPTIONS
// operation appearing in a refreshed spec is counted rather than silently ignored.
const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
```

In `tests/spec.test.ts` replace `const methods = new Set(["get", "post", "put", "patch", "delete"]);` with `const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);`.

- [ ] **Step 4: Clear `dist/` before every build**

In `package.json` `scripts`, add before `"build"`:

```json
    "prebuild": "node -e \"require('node:fs').rmSync('dist', { recursive: true, force: true })\"",
```

(`npm run build` runs `prebuild` first. A deleted source file otherwise leaves its stale module in the package — `dist/api/shared.js` did exactly that after the Phase 1 rename.)

- [ ] **Step 5: Bump the two GitHub Actions to their current majors**

The v0.5.0 release run annotated: "Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4." Both actions are three majors behind (upstream on 2026-10-14: `actions/checkout@v7`, `actions/setup-node@v7`).

In both `.github/workflows/test.yml` and `.github/workflows/release.yml`:

```diff
-      - uses: actions/checkout@v4
+      - uses: actions/checkout@v7
-      - uses: actions/setup-node@v4
+      - uses: actions/setup-node@v7
```

Keep every `with:` block as is; both majors keep the `node-version`, `registry-url` and `cache` inputs. The PR's `test.yml` run is the proof for the test workflow; the release workflow is proven by the v0.6.0 tag in Task 13, so check that run for the annotation being gone.

- [ ] **Step 6: Run the gate**

Run: `npm run typecheck && npm test && npm run build && ls dist/api`
Expected: typecheck clean; all tests pass; `dist/api` lists no `shared.*` files.

- [ ] **Step 7: Update FOLLOWUPS #20**

In `docs/FOLLOWUPS.md` item 20, strike (wrap in `~~`) these three bullets and append ` — RESOLVED (Phase 2, Task 1).` to each: the "eight methods" bullet, the "Clear `dist/`" bullet, the "type guard" bullet. Leave the others; Tasks 5, 7 and 13 strike theirs. Add one bullet at the end of #20:

```markdown
    - Typecheck `tests/` in CI and `raw: any → unknown` in the normalisers are deferred again: both are mechanical but wide (every fixture and every normaliser), and neither hides a bug. Phase 3 entry list.
```

- [ ] **Step 8: Commit (after go-ahead)**

```bash
git add src/config.ts tests/config.test.ts tests/spec.test.ts tests/contract.test.ts package.json docs/FOLLOWUPS.md .github/workflows/test.yml .github/workflows/release.yml
git commit -m "chore: close the phase 2 entry list — type guard, eight methods, clean dist, actions v7"
```

---

### Task 2: Register the 41 Phase 2 operations

**Files:**
- Modify: `src/operations.ts`
- Modify: `tests/contract.test.ts` (delete the Phase 2 block)
- Modify: `tests/operations.test.ts` (count 15 → 56; parameter-name checks)

**Interfaces:**
- Produces: `operations.user.me`, `operations.workspace.get`, `operations.tags.{list,create,get,update,remove}`, `operations.portfolios.{list,create,get,update,remove}`, `operations.projects.{create,get,update,remove,archive,unarchive}`, `operations.boards.{create,update,remove,move}`, `operations.columns.{create,update,remove,move}`, `operations.tasks.{addLocation,removeLocation,addWatchers,removeWatchers,startTimer,stopTimer,addTimeEntry,updateTimeEntry,removeTimeEntry,addAssignees,removeAssignees,setParent,listComments,addComment,removeComment}`. Path parameters: `{tagId}`, `{portfolioId}`, `{projectId}`, `{boardId}`, `{columnId}`, `{taskId}`, `{timeEntryId}`, `{commentId}`.

- [ ] **Step 1: Write the failing tests**

In `tests/operations.test.ts` change `expect(all.length).toBe(15);` to `expect(all.length).toBe(56);` and add to the camelCase test:

```ts
    expect(operations.tasks.updateTimeEntry.path).toBe("/tm/tasks/{taskId}/time-entries/{timeEntryId}");
    expect(operations.tasks.removeComment.path).toBe("/tm/tasks/{taskId}/comments/{commentId}");
    expect(operations.columns.move.path).toBe("/tm/board-columns/{columnId}/move");
```

In `tests/contract.test.ts` delete the whole `// ── Phase 2 · task manager` block (the comment line and the 15 lines after it, up to but not including `// ── Phase 3`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/operations.test.ts tests/contract.test.ts`
Expected: FAIL — `expected 15 to be 56`, and the contract test lists 41 operations "in the spec, not registered, not deferred".

- [ ] **Step 3: Add the operations**

Replace the `operations` object in `src/operations.ts` with:

```ts
export const operations = {
  user: {
    me: { method: "GET", path: "/user/me" },
  },
  workspace: {
    get: { method: "GET", path: "/ws" },
    listMembers: { method: "GET", path: "/ws/members" },
  },
  tags: {
    list: { method: "GET", path: "/ws/tags" },
    create: { method: "POST", path: "/ws/tags" },
    get: { method: "GET", path: "/ws/tags/{tagId}" },
    update: { method: "PUT", path: "/ws/tags/{tagId}" },
    remove: { method: "DELETE", path: "/ws/tags/{tagId}" },
  },
  portfolios: {
    list: { method: "GET", path: "/tm/portfolios" },
    create: { method: "POST", path: "/tm/portfolios" },
    get: { method: "GET", path: "/tm/portfolios/{portfolioId}" },
    update: { method: "PUT", path: "/tm/portfolios/{portfolioId}" },
    remove: { method: "DELETE", path: "/tm/portfolios/{portfolioId}" },
  },
  projects: {
    list: { method: "GET", path: "/tm/projects" },
    create: { method: "POST", path: "/tm/projects" },
    get: { method: "GET", path: "/tm/projects/{projectId}" },
    update: { method: "PUT", path: "/tm/projects/{projectId}" },
    remove: { method: "DELETE", path: "/tm/projects/{projectId}" },
    archive: { method: "POST", path: "/tm/projects/{projectId}/archive" },
    unarchive: { method: "POST", path: "/tm/projects/{projectId}/un-archive" },
  },
  boards: {
    list: { method: "GET", path: "/tm/boards" },
    create: { method: "POST", path: "/tm/boards" },
    update: { method: "PUT", path: "/tm/boards/{boardId}" },
    remove: { method: "DELETE", path: "/tm/boards/{boardId}" },
    move: { method: "POST", path: "/tm/boards/{boardId}/move" },
  },
  columns: {
    list: { method: "GET", path: "/tm/board-columns" },
    create: { method: "POST", path: "/tm/board-columns" },
    update: { method: "PUT", path: "/tm/board-columns/{columnId}" },
    remove: { method: "DELETE", path: "/tm/board-columns/{columnId}" },
    move: { method: "POST", path: "/tm/board-columns/{columnId}/move" },
  },
  tasks: {
    list: { method: "GET", path: "/tm/tasks" },
    create: { method: "POST", path: "/tm/tasks" },
    get: { method: "GET", path: "/tm/tasks/{taskId}" },
    update: { method: "PUT", path: "/tm/tasks/{taskId}" },
    remove: { method: "DELETE", path: "/tm/tasks/{taskId}" },
    complete: { method: "POST", path: "/tm/tasks/{taskId}/complete" },
    uncomplete: { method: "POST", path: "/tm/tasks/{taskId}/un-complete" },
    changeBoard: { method: "POST", path: "/tm/tasks/{taskId}/board" },
    changeColumn: { method: "POST", path: "/tm/tasks/{taskId}/board-column" },
    uploadAttachment: { method: "POST", path: "/tm/tasks/{taskId}/attachments" },
    addLocation: { method: "POST", path: "/tm/tasks/{taskId}/locations" },
    removeLocation: { method: "DELETE", path: "/tm/tasks/{taskId}/locations" },
    addWatchers: { method: "POST", path: "/tm/tasks/{taskId}/watchers" },
    removeWatchers: { method: "DELETE", path: "/tm/tasks/{taskId}/watchers" },
    startTimer: { method: "POST", path: "/tm/tasks/{taskId}/start-timer" },
    stopTimer: { method: "POST", path: "/tm/tasks/{taskId}/stop-timer" },
    addTimeEntry: { method: "POST", path: "/tm/tasks/{taskId}/time-entries" },
    updateTimeEntry: { method: "PUT", path: "/tm/tasks/{taskId}/time-entries/{timeEntryId}" },
    removeTimeEntry: { method: "DELETE", path: "/tm/tasks/{taskId}/time-entries/{timeEntryId}" },
    addAssignees: { method: "POST", path: "/tm/tasks/{taskId}/assignees" },
    removeAssignees: { method: "DELETE", path: "/tm/tasks/{taskId}/assignees" },
    setParent: { method: "POST", path: "/tm/tasks/{taskId}/parent" },
    listComments: { method: "GET", path: "/tm/tasks/{taskId}/comments" },
    addComment: { method: "POST", path: "/tm/tasks/{taskId}/comments" },
    removeComment: { method: "DELETE", path: "/tm/tasks/{taskId}/comments/{commentId}" },
  },
  attachments: {
    get: { method: "GET", path: "/ws/attachments/{fileId}" },
  },
} as const satisfies Record<string, Record<string, Operation>>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/operations.test.ts tests/contract.test.ts`
Expected: PASS, including "accounts for every operation: registered + deferred = spec" (56 + 101 = 157).

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/operations.ts tests/operations.test.ts tests/contract.test.ts
git commit -m "feat(api): register the 41 task-manager operations of phase 2"
```

---

### Task 3: Task types, the extended `toTask`, and the task relation methods

**Files:**
- Modify: `src/api/constants.ts` (`taskPriorities`, `taskTypes`)
- Create: `src/api/priority.ts`
- Modify: `src/api/types.ts` (`TaskPriority`, `TaskType`, `TaskLocation`, `TimeEntry`, `TaskComment`, `CommentsPage`; grow `WeeekTask`, `NewTask`)
- Modify: `src/api/tasks.ts`
- Test: `tests/api/priority.test.ts`, `tests/api/tasks.test.ts`

**Interfaces:**
- Consumes: `operations.tasks.*` (Task 2), `HttpClient.execute`, `pickArray`.
- Produces: `taskPriorities`, `taskTypes` (constants); `priorityCode(name)`, `priorityName(code)`; types `TaskPriority`, `TaskType`, `TaskLocation`, `TimeEntry`, `TaskComment`, `CommentsPage`; `WeeekTask` with the new fields; `NewTask` with `priority?: number; type?: TaskType; parentId?: number`; `TasksApi.listComments({ taskId, limit?, offset? })`, `addComment({ taskId, markdown, parentId? })`, `removeComment({ taskId, commentId })`, `addAssignees({ taskId, memberIds })`, `removeAssignees(...)`, `addWatchers(...)`, `removeWatchers(...)`, `addLocation({ taskId, projectId, boardColumnId? })`, `removeLocation({ taskId, projectId })`, `setParent({ taskId, parentId })`. Every method that changes a task returns the re-read `WeeekTask`.

- [ ] **Step 1: Constants and types**

Append to `src/api/constants.ts`:

```ts
// A task priority travels as an integer code that is this list's index (0 low … 3 hold), so the
// list is the whole mapping; see src/api/priority.ts.
export const taskPriorities = ["low", "medium", "high", "hold"] as const;
export const taskTypes = ["action", "meet", "call"] as const;
```

Create `src/api/priority.ts`:

```ts
import { taskPriorities } from "./constants.js";
import type { TaskPriority } from "./types.js";

export function priorityCode(name: TaskPriority): number {
  return taskPriorities.indexOf(name);
}

/** The name for a wire code, or null for anything that is not one — the API sends null for "unset". */
export function priorityName(code: unknown): TaskPriority | null {
  if (typeof code !== "number" || !Number.isInteger(code) || code < 0 || code >= taskPriorities.length) return null;
  return taskPriorities[code];
}
```

In `src/api/types.ts`, add after the `attachmentServices` import: `import type { taskPriorities, taskTypes } from "./constants.js";` (extend the existing type-only import), then add:

```ts
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskType = (typeof taskTypes)[number];

export interface TaskLocation { projectId: number; boardId: number | null; boardColumnId: number | null; }

export interface TimeEntry {
  id: string;
  userId: string;
  /** `Y-m-d`. */
  date: string;
  /** Minutes; the API caps it at 1440. */
  duration: number;
  isOvertime: boolean;
  comment: string;
}

export interface TaskComment {
  id: number;
  parentId: number | null;
  authorId: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}
export interface CommentsPage { comments: TaskComment[]; hasMore: boolean; }
```

Replace `WeeekTask` and `NewTask` with:

```ts
export interface WeeekTask {
  id: number; title: string; description: string | null;
  projectId: number | null; boardId: number | null; boardColumnId: number | null;
  parentId: number | null; subTasks: number[];
  assignees: string[]; watchers: string[]; authorId: string | null;
  priority: TaskPriority | null; type: TaskType | null;
  startDate: string | null; dueDate: string | null;
  completed: boolean; completedAt: string | null; createdAt: string | null;
  /** Time estimate, in minutes. */
  duration: number | null;
  tags: number[];
  locations: TaskLocation[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
}

export interface NewTask {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
  /** Wire code; use priorityCode() to build it from a name. */
  priority?: number;
  type?: TaskType;
  parentId?: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/api/priority.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { priorityCode, priorityName } from "../../src/api/priority.js";

describe("task priority codes", () => {
  it("round-trips every name through its wire code", () => {
    for (const [code, name] of ["low", "medium", "high", "hold"].entries()) {
      expect(priorityCode(name as "low")).toBe(code);
      expect(priorityName(code)).toBe(name);
    }
  });
  it("maps anything that is not a known code to null", () => {
    expect(priorityName(null)).toBeNull();
    expect(priorityName(4)).toBeNull();
    expect(priorityName("1")).toBeNull();
  });
});
```

In `tests/api/tasks.test.ts`, replace the `rawTask` constant and the first test with:

```ts
const rawTask = {
  id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8,
  assignees: ["a2318d51-uuid"], dueDate: "2026-07-22", isCompleted: false,
  parentId: null, priority: 2, type: "action", subscribers: ["u7"], tags: [5], subTasks: [80],
  locations: [{ projectId: 2, boardId: 3, boardColumnId: 8 }],
  timeEntries: [{ id: "te1", userId: "u1", date: "2026-07-20", duration: 30, isOvertime: false, comment: "" }],
  authorId: "u1", createdAt: "2026-07-01T10:00:00Z", startDate: "2026-07-20", duration: 60,
};
// The same task after toTask: what every tool returns to the model.
const normalisedTask = {
  id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8,
  parentId: null, subTasks: [80], assignees: ["a2318d51-uuid"], watchers: ["u7"], authorId: "u1",
  priority: "high", type: "action", startDate: "2026-07-20", dueDate: "2026-07-22",
  completed: false, completedAt: null, createdAt: "2026-07-01T10:00:00Z", duration: 60, tags: [5],
  locations: [{ projectId: 2, boardId: 3, boardColumnId: 8 }],
  timeEntries: [{ id: "te1", userId: "u1", date: "2026-07-20", duration: 30, isOvertime: false, comment: "" }],
  attachments: [],
};

describe("TasksApi", () => {
  it("list GETs /tm/tasks with the query and normalises each task", async () => {
    const f = jsonFetch(200, { success: true, tasks: [rawTask] });
    const out = await new TasksApi(httpWith(f)).list({ projectId: 2, perPage: 20 });
    expect(out).toEqual([normalisedTask]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks?projectId=2&perPage=20");
  });
```

Change the "get defaults assignees and attachments to [] when absent" test to also assert the new defaults:

```ts
    expect(t.watchers).toEqual([]);
    expect(t.tags).toEqual([]);
    expect(t.subTasks).toEqual([]);
    expect(t.locations).toEqual([]);
    expect(t.timeEntries).toEqual([]);
    expect(t.priority).toBeNull();
    expect(t.type).toBeNull();
    expect(t.parentId).toBeNull();
```

Change the create test to also send the new fields:

```ts
  it("create POSTs title + locations and optional fields only when given", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, id: 5 } });
    const t = await new TasksApi(httpWith(f)).create({ title: "T", projectId: 1, boardColumnId: 2, userId: "u1", dayFrom: "2026-08-01", priority: 2, type: "call", parentId: 70 });
    expect(t.id).toBe(5);
    const { url, init, json } = sent(f);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks");
    expect(init.method).toBe("POST");
    expect(json()).toEqual({ title: "T", locations: [{ projectId: 1, boardColumnId: 2 }], userId: "u1", dayFrom: "2026-08-01", priority: 2, type: "call", parentId: 70 });
  });
```

Append these tests inside the `describe`:

```ts
  it("listComments GETs the page and normalises comments", async () => {
    const raw = { id: 9, parentId: null, authorId: "u1", markdown: "hi", createdAt: "2026-07-01T10:00:00Z", updatedAt: "2026-07-01T10:00:00Z" };
    const f = jsonFetch(200, { comments: [raw], hasMore: true });
    expect(await new TasksApi(httpWith(f)).listComments({ taskId: 78, limit: 10, offset: 20 })).toEqual({ comments: [raw], hasMore: true });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/comments?limit=10&offset=20");
  });

  it("addComment POSTs markdown and only sends parentId when replying", async () => {
    const raw = { id: 10, parentId: 9, authorId: "u1", markdown: "re", createdAt: "x", updatedAt: "x" };
    const f = jsonFetch(200, { comment: raw });
    expect(await new TasksApi(httpWith(f)).addComment({ taskId: 78, markdown: "re", parentId: 9 })).toEqual(raw);
    expect(sent(f).json()).toEqual({ markdown: "re", parentId: 9 });
    const g = jsonFetch(200, { comment: { ...raw, parentId: null } });
    await new TasksApi(httpWith(g)).addComment({ taskId: 78, markdown: "top" });
    expect(sent(g).json()).toEqual({ markdown: "top" });
  });

  it("removeComment DELETEs and accepts an empty 204 body", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(new TasksApi(httpWith(f)).removeComment({ taskId: 78, commentId: 9 })).resolves.toBeUndefined();
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/comments/9");
  });

  it.each([
    ["addAssignees", "POST", "assignees", "assignees"],
    ["removeAssignees", "DELETE", "assignees", "assignees"],
    ["addWatchers", "POST", "watchers", "watchers"],
    ["removeWatchers", "DELETE", "watchers", "watchers"],
  ] as const)("%s sends %s /%s with the member ids, then re-reads the task", async (method, verb, segment, bodyKey) => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    const t = await new TasksApi(httpWith(f))[method]({ taskId: 78, memberIds: ["u1", "u2"] });
    expect(t).toEqual(normalisedTask);
    expect(sent(f, 0).init.method).toBe(verb);
    expect(sent(f, 0).url).toBe(`https://api.weeek.net/public/v1/tm/tasks/78/${segment}`);
    expect(sent(f, 0).json()).toEqual({ [bodyKey]: ["u1", "u2"] });
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
  });

  it("addLocation POSTs the project and the column only when given; the API answers 204", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, task: rawTask }), { status: 200 }));
    await new TasksApi(httpWith(f)).addLocation({ taskId: 78, projectId: 4 });
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/locations");
    expect(sent(f, 0).json()).toEqual({ projectId: 4 });
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).addLocation({ taskId: 78, projectId: 4, boardColumnId: 12 });
    expect(sent(g, 0).json()).toEqual({ projectId: 4, boardColumnId: 12 });
  });

  it("removeLocation DELETEs with the project in the body", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).removeLocation({ taskId: 78, projectId: 4 });
    expect(sent(f, 0).init.method).toBe("DELETE");
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/locations");
    expect(sent(f, 0).json()).toEqual({ projectId: 4 });
  });

  it("setParent sends parentId, including an explicit null to detach", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).setParent({ taskId: 80, parentId: 78 });
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/80/parent");
    expect(sent(f, 0).json()).toEqual({ parentId: 78 });
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).setParent({ taskId: 80, parentId: null });
    expect(sent(g, 0).json()).toEqual({ parentId: null });
  });
```

and change the vitest import to `import { describe, it, expect, vi } from "vitest";`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/api/priority.test.ts tests/api/tasks.test.ts`
Expected: FAIL — `priority.js` not found; `toEqual` mismatch on the new fields; `listComments is not a function`.

- [ ] **Step 4: Implement**

Replace `src/api/tasks.ts` with:

```ts
import type { HttpClient, Query } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import { priorityName } from "./priority.js";
import { taskTypes } from "./constants.js";
import type { Attachment, CommentsPage, NewTask, TaskComment, TaskLocation, TaskType, TimeEntry, WeeekTask } from "./types.js";

export interface SetCompletedOptions { taskId: number; completed: boolean; }
export interface MoveTaskOptions { taskId: number; boardId: number; boardColumnId: number; }
export interface UploadAttachmentOptions { taskId: number; filename: string; bytes: Uint8Array | Blob; }
export interface ListCommentsOptions { taskId: number; limit?: number; offset?: number; }
export interface AddCommentOptions { taskId: number; markdown: string; parentId?: number; }
export interface CommentRef { taskId: number; commentId: number; }
export interface TaskMembersOptions { taskId: number; memberIds: string[]; }
export interface AddLocationOptions { taskId: number; projectId: number; boardColumnId?: number; }
export interface RemoveLocationOptions { taskId: number; projectId: number; }
export interface SetParentOptions { taskId: number; parentId: number | null; }

const ops = operations.tasks;

const optionalNumber = (value: unknown): number | null => (value == null ? null : Number(value));
const optionalString = (value: unknown): string | null => (value == null ? null : String(value));

function toLocation(raw: any): TaskLocation {
  return { projectId: Number(raw.projectId), boardId: optionalNumber(raw.boardId), boardColumnId: optionalNumber(raw.boardColumnId) };
}

export function toTimeEntry(raw: any): TimeEntry {
  return {
    id: String(raw.id ?? ""), userId: String(raw.userId ?? ""), date: String(raw.date ?? ""),
    duration: Number(raw.duration ?? 0), isOvertime: Boolean(raw.isOvertime), comment: raw.comment == null ? "" : String(raw.comment),
  };
}

function toComment(raw: any): TaskComment {
  return {
    id: Number(raw.id), parentId: optionalNumber(raw.parentId), authorId: String(raw.authorId ?? ""),
    markdown: String(raw.markdown ?? ""), createdAt: String(raw.createdAt ?? ""), updatedAt: String(raw.updatedAt ?? ""),
  };
}

function toTask(raw: any): WeeekTask {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    description: raw.description ?? null,
    projectId: optionalNumber(raw.projectId),
    boardId: optionalNumber(raw.boardId),
    boardColumnId: optionalNumber(raw.boardColumnId),
    parentId: optionalNumber(raw.parentId),
    subTasks: Array.isArray(raw.subTasks) ? raw.subTasks.map(Number) : [],
    assignees: Array.isArray(raw.assignees) ? raw.assignees.map(String) : [],
    // The API calls watchers "subscribers" on the task and "watchers" on the endpoint that sets them.
    watchers: Array.isArray(raw.subscribers) ? raw.subscribers.map(String) : [],
    authorId: optionalString(raw.authorId),
    priority: priorityName(raw.priority),
    type: (taskTypes as readonly string[]).includes(raw.type) ? (raw.type as TaskType) : null,
    startDate: optionalString(raw.startDate),
    dueDate: optionalString(raw.dueDate),
    completed: Boolean(raw.isCompleted ?? raw.completed ?? false),
    completedAt: optionalString(raw.completedAt),
    createdAt: optionalString(raw.createdAt),
    duration: optionalNumber(raw.duration),
    tags: Array.isArray(raw.tags) ? raw.tags.map(Number) : [],
    locations: Array.isArray(raw.locations) ? raw.locations.map(toLocation) : [],
    timeEntries: Array.isArray(raw.timeEntries) ? raw.timeEntries.map(toTimeEntry) : [],
    // The API returns these with every task; surfacing them is what lets a caller see a
    // screenshot-only description instead of silently working from the prose.
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as Attachment[]) : [],
  };
}

export class TasksApi {
  constructor(private http: HttpClient) {}

  async list(query: Query): Promise<WeeekTask[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    return pickArray(json, "tasks").map(toTask);
  }

  async create(newTask: NewTask): Promise<WeeekTask> {
    const location: Record<string, number> = { projectId: newTask.projectId };
    if (newTask.boardColumnId !== undefined) location.boardColumnId = newTask.boardColumnId;
    const payload: Record<string, unknown> = { title: newTask.title, locations: [location] };
    if (newTask.description !== undefined) payload.description = newTask.description;
    if (newTask.userId !== undefined) payload.userId = newTask.userId;
    if (newTask.dayFrom !== undefined) payload.dayFrom = newTask.dayFrom;
    if (newTask.priority !== undefined) payload.priority = newTask.priority;
    if (newTask.type !== undefined) payload.type = newTask.type;
    if (newTask.parentId !== undefined) payload.parentId = newTask.parentId;
    const json = await this.http.execute<{ task: unknown }>(ops.create, { body: payload });
    return toTask(json.task);
  }

  async get(id: number): Promise<WeeekTask> {
    const json = await this.http.execute<{ task: unknown }>(ops.get, { params: { taskId: id } });
    return toTask(json.task);
  }

  async update(id: number, patch: Record<string, unknown>): Promise<WeeekTask> {
    const json = await this.http.execute<{ task: unknown }>(ops.update, { params: { taskId: id }, body: patch });
    return toTask(json.task);
  }

  async remove(id: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { taskId: id } });
  }

  async setCompleted({ taskId, completed }: SetCompletedOptions): Promise<WeeekTask> {
    await this.http.execute(completed ? ops.complete : ops.uncomplete, { params: { taskId } });
    return this.get(taskId);
  }

  // Two requests the API does not offer as one; if the second fails the task sits on the
  // new board in its old column (FOLLOWUPS #6).
  async move({ taskId, boardId, boardColumnId }: MoveTaskOptions): Promise<WeeekTask> {
    await this.http.execute(ops.changeBoard, { params: { taskId }, body: { boardId } });
    await this.http.execute(ops.changeColumn, { params: { taskId }, body: { boardColumnId } });
    return this.get(taskId);
  }

  async uploadAttachment({ taskId, filename, bytes }: UploadAttachmentOptions): Promise<Attachment[]> {
    const form = new FormData();
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart]);
    form.append("files[]", blob, filename);
    const json = await this.http.execute<{ data?: unknown }>(ops.uploadAttachment, { params: { taskId }, body: form });
    // The spec documents `data` as one Attachment; accept a list too — `files[]` is a
    // multipart array and the live shape has not been pinned down (FOLLOWUPS #18).
    if (Array.isArray(json.data)) return json.data as Attachment[];
    return json.data ? [json.data as Attachment] : [];
  }

  async listComments({ taskId, limit, offset }: ListCommentsOptions): Promise<CommentsPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.listComments, { params: { taskId }, query: { limit, offset } });
    return { comments: pickArray(json, "comments").map(toComment), hasMore: Boolean(json.hasMore) };
  }

  async addComment({ taskId, markdown, parentId }: AddCommentOptions): Promise<TaskComment> {
    const body: Record<string, unknown> = { markdown };
    if (parentId !== undefined) body.parentId = parentId;
    const json = await this.http.execute<{ comment: unknown }>(ops.addComment, { params: { taskId }, body });
    return toComment(json.comment);
  }

  async removeComment({ taskId, commentId }: CommentRef): Promise<void> {
    await this.http.execute(ops.removeComment, { params: { taskId, commentId } });
  }

  async addAssignees({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.addAssignees, { params: { taskId }, body: { assignees: memberIds } });
    return this.get(taskId);
  }

  async removeAssignees({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.removeAssignees, { params: { taskId }, body: { assignees: memberIds } });
    return this.get(taskId);
  }

  async addWatchers({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.addWatchers, { params: { taskId }, body: { watchers: memberIds } });
    return this.get(taskId);
  }

  async removeWatchers({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.removeWatchers, { params: { taskId }, body: { watchers: memberIds } });
    return this.get(taskId);
  }

  async addLocation({ taskId, projectId, boardColumnId }: AddLocationOptions): Promise<WeeekTask> {
    const body: Record<string, unknown> = { projectId };
    if (boardColumnId !== undefined) body.boardColumnId = boardColumnId;
    await this.http.execute(ops.addLocation, { params: { taskId }, body });
    return this.get(taskId);
  }

  async removeLocation({ taskId, projectId }: RemoveLocationOptions): Promise<WeeekTask> {
    await this.http.execute(ops.removeLocation, { params: { taskId }, body: { projectId } });
    return this.get(taskId);
  }

  async setParent({ taskId, parentId }: SetParentOptions): Promise<WeeekTask> {
    // parentId: null is how the API detaches a subtask, so the key is always sent.
    await this.http.execute(ops.setParent, { params: { taskId }, body: { parentId } });
    return this.get(taskId);
  }
}
```

(`toTimeEntry` is exported because Task 4 returns time entries from their own endpoints.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/api && npm run typecheck`
Expected: PASS; typecheck clean. (`tests/tools/tasks.test.ts` still passes: its stubs return partial objects and nothing asserts on the new fields.)

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/api/constants.ts src/api/priority.ts src/api/types.ts src/api/tasks.ts tests/api/priority.test.ts tests/api/tasks.test.ts
git commit -m "feat(api): comments, assignees, watchers, locations and parent on TasksApi"
```

---

### Task 4: Timers and time entries on `TasksApi`

**Files:**
- Modify: `src/api/types.ts` (`TimeEntryFields`)
- Modify: `src/api/tasks.ts`
- Test: `tests/api/tasks.test.ts`

**Interfaces:**
- Consumes: `toTimeEntry`, `operations.tasks.{startTimer,stopTimer,addTimeEntry,updateTimeEntry,removeTimeEntry}`.
- Produces: `TimeEntryFields { userId: string; date: string; duration: number; isOvertime: boolean }`; `TasksApi.startTimer(taskId)`, `stopTimer(taskId)` → `{ success: boolean }`; `addTimeEntry({ taskId, entry })`, `updateTimeEntry({ taskId, timeEntryId, entry })` → `TimeEntry`; `removeTimeEntry({ taskId, timeEntryId })` → `{ success: boolean }`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("TasksApi")` block of `tests/api/tasks.test.ts`:

```ts
  it.each([["startTimer", "start-timer"], ["stopTimer", "stop-timer"]] as const)("%s POSTs /%s and returns the envelope", async (method, segment) => {
    const f = jsonFetch(200, { success: true });
    expect(await new TasksApi(httpWith(f))[method](78)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(`https://api.weeek.net/public/v1/tm/tasks/78/${segment}`);
  });

  const entryFields = { userId: "u1", date: "2026-07-20", duration: 45, isOvertime: true };
  const rawEntry = { id: "te9", ...entryFields, comment: "", type: 1 };
  const entry = { id: "te9", ...entryFields, comment: "" };

  it("addTimeEntry POSTs the four fields and returns the entry", async () => {
    const f = jsonFetch(200, { success: true, data: rawEntry });
    expect(await new TasksApi(httpWith(f)).addTimeEntry({ taskId: 78, entry: entryFields })).toEqual(entry);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/time-entries");
    expect(sent(f).json()).toEqual(entryFields);
  });

  it("updateTimeEntry PUTs the four fields to the entry's path", async () => {
    const f = jsonFetch(200, { success: true, data: rawEntry });
    expect(await new TasksApi(httpWith(f)).updateTimeEntry({ taskId: 78, timeEntryId: "te9", entry: entryFields })).toEqual(entry);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/time-entries/te9");
    expect(sent(f).json()).toEqual(entryFields);
  });

  it("removeTimeEntry DELETEs the entry's path", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new TasksApi(httpWith(f)).removeTimeEntry({ taskId: 78, timeEntryId: "te9" })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/time-entries/te9");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/api/tasks.test.ts`
Expected: FAIL — `startTimer is not a function`.

- [ ] **Step 3: Implement**

In `src/api/types.ts` add after `TimeEntry`:

```ts
/** What the API needs to record time: a PUT replaces all four, so an update sends all four too. */
export interface TimeEntryFields { userId: string; date: string; duration: number; isOvertime: boolean; }
```

In `src/api/tasks.ts` add `TimeEntryFields` to the type import, these option types after `SetParentOptions`:

```ts
export interface AddTimeEntryOptions { taskId: number; entry: TimeEntryFields; }
export interface UpdateTimeEntryOptions { taskId: number; timeEntryId: string; entry: TimeEntryFields; }
export interface TimeEntryRef { taskId: number; timeEntryId: string; }
```

and these methods at the end of the class:

```ts
  async startTimer(taskId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.startTimer, { params: { taskId } });
  }

  async stopTimer(taskId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.stopTimer, { params: { taskId } });
  }

  async addTimeEntry({ taskId, entry }: AddTimeEntryOptions): Promise<TimeEntry> {
    const json = await this.http.execute<{ data: unknown }>(ops.addTimeEntry, { params: { taskId }, body: entry });
    return toTimeEntry(json.data);
  }

  async updateTimeEntry({ taskId, timeEntryId, entry }: UpdateTimeEntryOptions): Promise<TimeEntry> {
    const json = await this.http.execute<{ data: unknown }>(ops.updateTimeEntry, { params: { taskId, timeEntryId }, body: entry });
    return toTimeEntry(json.data);
  }

  async removeTimeEntry({ taskId, timeEntryId }: TimeEntryRef): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.removeTimeEntry, { params: { taskId, timeEntryId } });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/tasks.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/api/types.ts src/api/tasks.ts tests/api/tasks.test.ts
git commit -m "feat(api): timers and time entries on TasksApi"
```

---

### Task 5: Projects, boards and columns — typed responses and full CRUD

**Files:**
- Modify: `src/api/constants.ts` (`projectStatuses`)
- Modify: `src/api/types.ts` (`ProjectStatus`, `Project`, `NewProject`, `ProjectUpdate`, `Board`, `NewBoard`, `BoardColumn`, `NewColumn`; delete `NamedEntity`)
- Create: `src/api/requests.ts` (`apiFlag`)
- Modify: `src/api/responses.ts` (delete `toNamed`)
- Modify: `src/api/projects.ts`, `src/api/boards.ts`, `src/api/columns.ts`
- Test: `tests/api/requests.test.ts`, `tests/api/responses.test.ts`, `tests/api/projects.test.ts`, `tests/api/boards.test.ts`, `tests/api/columns.test.ts`

**Interfaces:**
- Consumes: `operations.{projects,boards,columns}.*` (Task 2), `pickArray`.
- Produces: `apiFlag(value: boolean): 0 | 1`; `toProject`, `toBoard`, `toColumn`; `ProjectsApi.list(): Project[]`, `get(projectId)`, `create(newProject: NewProject)`, `update({ projectId, update: ProjectUpdate })`, `remove(projectId)`, `setArchived({ projectId, archived })`; `BoardsApi.list(projectId): Board[]`, `create({ name, projectId })`, `update({ boardId, name })`, `remove(boardId)`, `move({ boardId, upperBoardId })`; `ColumnsApi.list(boardId): BoardColumn[]`, `create({ name, boardId })`, `update({ columnId, name })`, `remove(columnId)`, `move({ columnId, upperColumnId })`. Methods whose endpoint answers only `{ success }` return that envelope; `ProjectsApi.update` and `setArchived` re-read the project because `GET /tm/projects/{id}` exists, while boards and columns have no single-item GET.
- `Named<number>` (resolver) is satisfied structurally by `Project`, `Board` and `BoardColumn`, so the kinds table needs no change for them.

- [ ] **Step 1: Constants, types, the request helper**

Append to `src/api/constants.ts`:

```ts
// The spec types a project's status as 1 | 2 and documents neither value; the Phase 2 live
// smoke records which one an archived project carries (FOLLOWUPS).
export const projectStatuses = [1, 2] as const;
```

In `src/api/types.ts`: extend the type-only constants import to `import type { attachmentServices, projectStatuses, taskPriorities, taskTypes } from "./constants.js";`, delete `export interface NamedEntity { id: number; name: string; }`, and add:

```ts
export type ProjectStatus = (typeof projectStatuses)[number];

export interface Project {
  id: number; name: string; description: string | null; color: string | null;
  status: ProjectStatus | null; isPrivate: boolean; portfolioId: number | null;
  /** Member ids. */
  team: string[];
}
export interface NewProject { name: string; isPrivate: boolean; description?: string; portfolioId?: number; }
/** PUT /tm/projects/{id} replaces: the API requires name and isPrivate even when unchanged. */
export interface ProjectUpdate { name: string; isPrivate: boolean; color?: string; }

export interface Board { id: number; name: string; projectId: number; isPrivate: boolean; }
export interface NewBoard { name: string; projectId: number; }

export interface BoardColumn { id: number; name: string; boardId: number; }
export interface NewColumn { name: string; boardId: number; }
```

Create `src/api/requests.ts`:

```ts
/** The API documents several booleans as "use 0 or 1 instead of false or true" (isPrivate, completed, all). */
export function apiFlag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}
```

In `src/api/responses.ts` delete `toNamed` and the `NamedEntity` import, leaving `pickArray` and `toMember`.

- [ ] **Step 2: Write the failing tests**

Create `tests/api/requests.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { apiFlag } from "../../src/api/requests.js";

describe("apiFlag", () => {
  it("turns a boolean into the 0/1 the API wants", () => {
    expect(apiFlag(true)).toBe(1);
    expect(apiFlag(false)).toBe(0);
  });
});
```

Create `tests/api/responses.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickArray, toMember } from "../../src/api/responses.js";

describe("pickArray", () => {
  it("returns the array under the expected key", () => {
    expect(pickArray({ success: true, tags: [1] }, "tags")).toEqual([1]);
  });
  it("falls back to the first array present when the key is missing", () => {
    expect(pickArray({ success: true, items: [2] }, "tags")).toEqual([2]);
  });
  it("returns [] when nothing is an array", () => {
    expect(pickArray({ success: true }, "tags")).toEqual([]);
  });
});

describe("toMember", () => {
  it("joins first and last name", () => {
    expect(toMember({ id: "u1", firstName: "Ilya", lastName: "I" })).toEqual({ id: "u1", name: "Ilya I" });
  });
  it("falls back to name, then email, then the id", () => {
    expect(toMember({ id: "u2", name: "Bot" })).toEqual({ id: "u2", name: "Bot" });
    expect(toMember({ id: "u3", email: "x@y.z" })).toEqual({ id: "u3", name: "x@y.z" });
    expect(toMember({ id: "u4" })).toEqual({ id: "u4", name: "u4" });
  });
});
```

Replace `tests/api/projects.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { ProjectsApi } from "../../src/api/projects.js";
import { jsonFetch, httpWith, sent, bearer } from "../helpers/http.js";

const rawProject = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: 7, team: ["u1"], customFields: [], logoLink: null };
const project = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: 7, team: ["u1"] };
const base = "https://api.weeek.net/public/v1/tm/projects";

describe("ProjectsApi", () => {
  it("list GETs /tm/projects with the bearer and normalises each project", async () => {
    const f = jsonFetch(200, { success: true, projects: [rawProject] });
    expect(await new ProjectsApi(httpWith(f)).list()).toEqual([project]);
    expect(sent(f).url).toBe(base);
    expect(sent(f).init.headers).toMatchObject({ Authorization: bearer });
  });

  it("list defaults missing fields instead of failing", async () => {
    const f = jsonFetch(200, { success: true, projects: [{ id: 2, name: "Bare", status: 9 }] });
    expect(await new ProjectsApi(httpWith(f)).list()).toEqual([{ id: 2, name: "Bare", description: null, color: null, status: null, isPrivate: false, portfolioId: null, team: [] }]);
  });

  it("get GETs /tm/projects/{id}", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    expect(await new ProjectsApi(httpWith(f)).get(1)).toEqual(project);
    expect(sent(f).url).toBe(`${base}/1`);
  });

  it("create POSTs name + isPrivate as 0/1 and the optional fields only when given", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    expect(await new ProjectsApi(httpWith(f)).create({ name: "Marketing", isPrivate: false, description: "d", portfolioId: 7 })).toEqual(project);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Marketing", isPrivate: 0, description: "d", portfolioId: 7 });
    const g = jsonFetch(200, { success: true, project: rawProject });
    await new ProjectsApi(httpWith(g)).create({ name: "P", isPrivate: true });
    expect(sent(g).json()).toEqual({ name: "P", isPrivate: 1 });
  });

  it("update PUTs the replacement then re-reads the project", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    expect(await new ProjectsApi(httpWith(f)).update({ projectId: 1, update: { name: "M2", isPrivate: true, color: "#000" } })).toEqual(project);
    expect(sent(f, 0).init.method).toBe("PUT");
    expect(sent(f, 0).url).toBe(`${base}/1`);
    expect(sent(f, 0).json()).toEqual({ name: "M2", isPrivate: 1, color: "#000" });
    expect(sent(f, 1).url).toBe(`${base}/1`);
  });

  it("remove DELETEs and returns the envelope", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new ProjectsApi(httpWith(f)).remove(1)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/1`);
  });

  it("setArchived POSTs /archive or /un-archive then re-reads", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    await new ProjectsApi(httpWith(f)).setArchived({ projectId: 1, archived: true });
    expect(sent(f, 0).url).toBe(`${base}/1/archive`);
    expect(sent(f, 1).url).toBe(`${base}/1`);
    const g = jsonFetch(200, { success: true, project: rawProject });
    await new ProjectsApi(httpWith(g)).setArchived({ projectId: 1, archived: false });
    expect(sent(g, 0).url).toBe(`${base}/1/un-archive`);
  });
});
```

Replace `tests/api/boards.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { BoardsApi } from "../../src/api/boards.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const board = { id: 10, name: "Main", projectId: 2, isPrivate: false };
const base = "https://api.weeek.net/public/v1/tm/boards";

describe("BoardsApi", () => {
  it("list GETs /tm/boards?projectId=… and normalises each board", async () => {
    const f = jsonFetch(200, { success: true, boards: [board] });
    expect(await new BoardsApi(httpWith(f)).list(2)).toEqual([board]);
    expect(sent(f).url).toBe(`${base}?projectId=2`);
  });

  it("create POSTs name + projectId and returns the board", async () => {
    const f = jsonFetch(200, { success: true, board });
    expect(await new BoardsApi(httpWith(f)).create({ name: "Main", projectId: 2 })).toEqual(board);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Main", projectId: 2 });
  });

  it("update PUTs the name", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new BoardsApi(httpWith(f)).update({ boardId: 10, name: "Renamed" })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/10`);
    expect(sent(f).json()).toEqual({ name: "Renamed" });
  });

  it("remove DELETEs the board", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new BoardsApi(httpWith(f)).remove(10)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/10`);
  });

  it("move POSTs upperBoardId, null meaning the top", async () => {
    const f = jsonFetch(200, { success: true });
    await new BoardsApi(httpWith(f)).move({ boardId: 10, upperBoardId: 9 });
    expect(sent(f).url).toBe(`${base}/10/move`);
    expect(sent(f).json()).toEqual({ upperBoardId: 9 });
    const g = jsonFetch(200, { success: true });
    await new BoardsApi(httpWith(g)).move({ boardId: 10, upperBoardId: null });
    expect(sent(g).json()).toEqual({ upperBoardId: null });
  });
});
```

Replace `tests/api/columns.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { ColumnsApi } from "../../src/api/columns.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const column = { id: 100, name: "Done", boardId: 10 };
const base = "https://api.weeek.net/public/v1/tm/board-columns";

describe("ColumnsApi", () => {
  it("list GETs /tm/board-columns?boardId=… and normalises each column", async () => {
    const f = jsonFetch(200, { success: true, boardColumns: [column] });
    expect(await new ColumnsApi(httpWith(f)).list(10)).toEqual([column]);
    expect(sent(f).url).toBe(`${base}?boardId=10`);
  });

  it("create POSTs name + boardId and returns the column", async () => {
    const f = jsonFetch(200, { success: true, boardColumn: column });
    expect(await new ColumnsApi(httpWith(f)).create({ name: "Done", boardId: 10 })).toEqual(column);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Done", boardId: 10 });
  });

  it("update PUTs the name", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new ColumnsApi(httpWith(f)).update({ columnId: 100, name: "Shipped" })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/100`);
    expect(sent(f).json()).toEqual({ name: "Shipped" });
  });

  it("remove DELETEs the column", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new ColumnsApi(httpWith(f)).remove(100)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/100`);
  });

  it("move POSTs upperBoardColumnId, null meaning the first position", async () => {
    const f = jsonFetch(200, { success: true });
    await new ColumnsApi(httpWith(f)).move({ columnId: 100, upperColumnId: 99 });
    expect(sent(f).url).toBe(`${base}/100/move`);
    expect(sent(f).json()).toEqual({ upperBoardColumnId: 99 });
    const g = jsonFetch(200, { success: true });
    await new ColumnsApi(httpWith(g)).move({ columnId: 100, upperColumnId: null });
    expect(sent(g).json()).toEqual({ upperBoardColumnId: null });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/api`
Expected: FAIL — `requests.js` not found; `get is not a function`; `toEqual` mismatches where `toNamed` dropped fields.

- [ ] **Step 4: Implement the three resource clients**

Replace `src/api/projects.ts` with:

```ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import { apiFlag } from "./requests.js";
import { projectStatuses } from "./constants.js";
import type { NewProject, Project, ProjectStatus, ProjectUpdate } from "./types.js";

export interface UpdateProjectOptions { projectId: number; update: ProjectUpdate; }
export interface SetArchivedOptions { projectId: number; archived: boolean; }

const ops = operations.projects;

export function toProject(raw: any): Project {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    description: raw.description == null ? null : String(raw.description),
    color: raw.color == null ? null : String(raw.color),
    status: (projectStatuses as readonly number[]).includes(raw.status) ? (raw.status as ProjectStatus) : null,
    isPrivate: Boolean(raw.isPrivate),
    portfolioId: raw.portfolioId == null ? null : Number(raw.portfolioId),
    team: Array.isArray(raw.team) ? raw.team.map(String) : [],
  };
}

export class ProjectsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Project[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list);
    return pickArray(json, "projects").map(toProject);
  }

  async get(projectId: number): Promise<Project> {
    const json = await this.http.execute<{ project: unknown }>(ops.get, { params: { projectId } });
    return toProject(json.project);
  }

  async create(newProject: NewProject): Promise<Project> {
    const body: Record<string, unknown> = { name: newProject.name, isPrivate: apiFlag(newProject.isPrivate) };
    if (newProject.description !== undefined) body.description = newProject.description;
    if (newProject.portfolioId !== undefined) body.portfolioId = newProject.portfolioId;
    const json = await this.http.execute<{ project: unknown }>(ops.create, { body });
    return toProject(json.project);
  }

  // PUT answers with success only, so the project is re-read.
  async update({ projectId, update }: UpdateProjectOptions): Promise<Project> {
    const body: Record<string, unknown> = { name: update.name, isPrivate: apiFlag(update.isPrivate) };
    if (update.color !== undefined) body.color = update.color;
    await this.http.execute(ops.update, { params: { projectId }, body });
    return this.get(projectId);
  }

  async remove(projectId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { projectId } });
  }

  async setArchived({ projectId, archived }: SetArchivedOptions): Promise<Project> {
    await this.http.execute(archived ? ops.archive : ops.unarchive, { params: { projectId } });
    return this.get(projectId);
  }
}
```

Replace `src/api/boards.ts` with:

```ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { Board, NewBoard } from "./types.js";

export interface UpdateBoardOptions { boardId: number; name: string; }
/** `upperBoardId` is the board to place this one after; null puts it first. */
export interface MoveBoardOptions { boardId: number; upperBoardId: number | null; }

const ops = operations.boards;

export function toBoard(raw: any): Board {
  return { id: Number(raw.id), name: String(raw.name ?? ""), projectId: Number(raw.projectId), isPrivate: Boolean(raw.isPrivate) };
}

export class BoardsApi {
  constructor(private http: HttpClient) {}

  async list(projectId: number): Promise<Board[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query: { projectId } });
    return pickArray(json, "boards").map(toBoard);
  }

  async create(newBoard: NewBoard): Promise<Board> {
    const json = await this.http.execute<{ board: unknown }>(ops.create, { body: newBoard });
    return toBoard(json.board);
  }

  // No GET /tm/boards/{id} exists, so these return the API's envelope rather than a re-read.
  async update({ boardId, name }: UpdateBoardOptions): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.update, { params: { boardId }, body: { name } });
  }

  async remove(boardId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { boardId } });
  }

  async move({ boardId, upperBoardId }: MoveBoardOptions): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.move, { params: { boardId }, body: { upperBoardId } });
  }
}
```

Replace `src/api/columns.ts` with:

```ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { BoardColumn, NewColumn } from "./types.js";

export interface UpdateColumnOptions { columnId: number; name: string; }
/** `upperColumnId` is the column to place this one after; null puts it first. */
export interface MoveColumnOptions { columnId: number; upperColumnId: number | null; }

const ops = operations.columns;

export function toColumn(raw: any): BoardColumn {
  return { id: Number(raw.id), name: String(raw.name ?? ""), boardId: Number(raw.boardId) };
}

export class ColumnsApi {
  constructor(private http: HttpClient) {}

  async list(boardId: number): Promise<BoardColumn[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query: { boardId } });
    return pickArray(json, "boardColumns").map(toColumn);
  }

  async create(newColumn: NewColumn): Promise<BoardColumn> {
    const json = await this.http.execute<{ boardColumn: unknown }>(ops.create, { body: newColumn });
    return toColumn(json.boardColumn);
  }

  // No GET /tm/board-columns/{id} exists, so these return the API's envelope rather than a re-read.
  async update({ columnId, name }: UpdateColumnOptions): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.update, { params: { columnId }, body: { name } });
  }

  async remove(columnId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { columnId } });
  }

  async move({ columnId, upperColumnId }: MoveColumnOptions): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.move, { params: { columnId }, body: { upperBoardColumnId: upperColumnId } });
  }
}
```

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm test`
Expected: typecheck clean (nothing else imported `NamedEntity` or `toNamed`); all tests pass. `tests/tools/tasks.test.ts` and `tests/resolver.test.ts` stub these clients with `{ id, name }` objects, which still satisfy the resolver.

- [ ] **Step 6: Update FOLLOWUPS #20**

Strike the "Add `tests/api/responses.test.ts`…" bullet, appending ` — RESOLVED (Phase 2, Task 5): tests/api/responses.test.ts; the "unusable url" guard test was added to tests/api/attachments.test.ts.` — and add that test now, inside the `describe("AttachmentsApi")` of `tests/api/attachments.test.ts`:

```ts
  it("download refuses an attachment whose url does not parse", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile({ url: "not a url" }), maxBytes: 1024 })).rejects.toThrow(/unusable url/);
    expect(f).not.toHaveBeenCalled();
  });
```

- [ ] **Step 7: Commit (after go-ahead)**

```bash
git add src/api tests/api docs/FOLLOWUPS.md
git commit -m "feat(api): full project, board and column clients with typed responses"
```

---

### Task 6: Tags, portfolios, workspace and profile clients; the facade

**Files:**
- Modify: `src/api/types.ts` (`Tag`, `NewTag`, `TagUpdate`, `Portfolio`, `PortfolioQuery`, `PortfolioPage`, `NewPortfolio`, `Workspace`, `Profile`)
- Create: `src/api/tags.ts`, `src/api/portfolios.ts`, `src/api/user.ts`
- Modify: `src/api/workspace.ts` (`get`), `src/api/responses.ts` (`toProfile`), `src/client.ts`
- Test: `tests/api/tags.test.ts`, `tests/api/portfolios.test.ts`, `tests/api/user.test.ts`, `tests/api/workspace.test.ts`, `tests/api/responses.test.ts`, `tests/client.test.ts`

**Interfaces:**
- Produces: `TagsApi.list(): Tag[]`, `get(tagId)`, `create({ title })`, `update({ tagId, update: TagUpdate })` (re-reads), `remove(tagId)`; `PortfoliosApi.list(query?: PortfolioQuery): PortfolioPage`, `get(portfolioId)`, `create({ name, parentId? })`, `update({ portfolioId, name })`, `remove(portfolioId)`; `WorkspaceApi.get(): Workspace`; `UserApi.me(): Profile`; `WeeekClient.user`, `.tags`, `.portfolios`.

- [ ] **Step 1: Types**

Append to `src/api/types.ts`:

```ts
export interface Tag { id: number; title: string; color: string; }
export interface NewTag { title: string; }
/** PUT /ws/tags/{id} replaces both fields. */
export interface TagUpdate { title: string; color: string; }

export interface Portfolio { id: number; name: string; parentId: number | null; isPrivate: boolean; }
// A type alias, not an interface, so it is assignable to HttpClient's Query index signature.
export type PortfolioQuery = { search?: string; parentId?: number; limit?: number; offset?: number };
export interface PortfolioPage { portfolios: Portfolio[]; hasMore: boolean; }
export interface NewPortfolio { name: string; parentId?: number; }

export interface Workspace { id: number; title: string; description: string | null; isPersonal: boolean; }

/** The token owner, as GET /user/me reports it. `name` is joined the way members' names are. */
export interface Profile { id: string; name: string; email: string; language: string | null; timeZone: string | null; }
```

- [ ] **Step 2: Write the failing tests**

Create `tests/api/tags.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TagsApi } from "../../src/api/tags.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const tag = { id: 5, title: "urgent", color: "#f00" };
const base = "https://api.weeek.net/public/v1/ws/tags";

describe("TagsApi", () => {
  it("list GETs /ws/tags", async () => {
    const f = jsonFetch(200, { success: true, tags: [tag] });
    expect(await new TagsApi(httpWith(f)).list()).toEqual([tag]);
    expect(sent(f).url).toBe(base);
  });

  it("get GETs /ws/tags/{id}", async () => {
    const f = jsonFetch(200, { success: true, tag });
    expect(await new TagsApi(httpWith(f)).get(5)).toEqual(tag);
    expect(sent(f).url).toBe(`${base}/5`);
  });

  it("create POSTs the title", async () => {
    const f = jsonFetch(200, { success: true, tag });
    expect(await new TagsApi(httpWith(f)).create({ title: "urgent" })).toEqual(tag);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ title: "urgent" });
  });

  it("update PUTs title + color then re-reads the tag", async () => {
    const f = jsonFetch(200, { success: true, tag });
    expect(await new TagsApi(httpWith(f)).update({ tagId: 5, update: { title: "urgent", color: "#f00" } })).toEqual(tag);
    expect(sent(f, 0).init.method).toBe("PUT");
    expect(sent(f, 0).url).toBe(`${base}/5`);
    expect(sent(f, 0).json()).toEqual({ title: "urgent", color: "#f00" });
    expect(sent(f, 1).url).toBe(`${base}/5`);
  });

  it("remove DELETEs the tag", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new TagsApi(httpWith(f)).remove(5)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/5`);
  });
});
```

Create `tests/api/portfolios.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PortfoliosApi } from "../../src/api/portfolios.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const portfolio = { id: 7, name: "Clients", parentId: null, isPrivate: false };
const base = "https://api.weeek.net/public/v1/tm/portfolios";

describe("PortfoliosApi", () => {
  it("list GETs /tm/portfolios with the search query and returns the page", async () => {
    const f = jsonFetch(200, { success: true, data: [portfolio], hasMore: false });
    expect(await new PortfoliosApi(httpWith(f)).list({ search: "cli", limit: 50 })).toEqual({ portfolios: [portfolio], hasMore: false });
    expect(sent(f).url).toBe(`${base}?search=cli&limit=50`);
  });

  it("list without a query sends none", async () => {
    const f = jsonFetch(200, { success: true, data: [], hasMore: false });
    await new PortfoliosApi(httpWith(f)).list();
    expect(sent(f).url).toBe(base);
  });

  it("get GETs /tm/portfolios/{id}", async () => {
    const f = jsonFetch(200, { success: true, data: portfolio });
    expect(await new PortfoliosApi(httpWith(f)).get(7)).toEqual(portfolio);
    expect(sent(f).url).toBe(`${base}/7`);
  });

  it("create POSTs the name and the parent only when given", async () => {
    const f = jsonFetch(200, { success: true, data: portfolio });
    expect(await new PortfoliosApi(httpWith(f)).create({ name: "Clients", parentId: 3 })).toEqual(portfolio);
    expect(sent(f).json()).toEqual({ name: "Clients", parentId: 3 });
    const g = jsonFetch(200, { success: true, data: portfolio });
    await new PortfoliosApi(httpWith(g)).create({ name: "Clients" });
    expect(sent(g).json()).toEqual({ name: "Clients" });
  });

  it("update PUTs the name and returns the portfolio", async () => {
    const f = jsonFetch(200, { success: true, data: portfolio });
    expect(await new PortfoliosApi(httpWith(f)).update({ portfolioId: 7, name: "Clients" })).toEqual(portfolio);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/7`);
    expect(sent(f).json()).toEqual({ name: "Clients" });
  });

  it("remove DELETEs the portfolio", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new PortfoliosApi(httpWith(f)).remove(7)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/7`);
  });
});
```

Create `tests/api/user.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { UserApi } from "../../src/api/user.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

describe("UserApi", () => {
  it("me GETs /user/me and normalises the profile", async () => {
    const f = jsonFetch(200, { success: true, user: { id: "u1", email: "i@x.y", firstName: "Ilya", lastName: "I", language: "en", timeZone: "Europe/Minsk", logoLink: "" } });
    expect(await new UserApi(httpWith(f)).me()).toEqual({ id: "u1", name: "Ilya I", email: "i@x.y", language: "en", timeZone: "Europe/Minsk" });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/user/me");
  });
});
```

Append to `tests/api/workspace.test.ts` inside its `describe`:

```ts
  it("get GETs /ws and normalises the workspace", async () => {
    const f = jsonFetch(200, { success: true, workspace: { id: 3, title: "Acme", description: null, isPersonal: false, logo: null } });
    expect(await new WorkspaceApi(httpWith(f)).get()).toEqual({ id: 3, title: "Acme", description: null, isPersonal: false });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/ws");
  });
```

Append to `tests/api/responses.test.ts`:

```ts
describe("toProfile", () => {
  it("keeps the member name rule and adds the profile fields, nulling the absent ones", () => {
    expect(toProfile({ id: "u1", email: "i@x.y", firstName: "Ilya" })).toEqual({ id: "u1", name: "Ilya", email: "i@x.y", language: null, timeZone: null });
  });
});
```

(and extend its import to `import { pickArray, toMember, toProfile } from "../../src/api/responses.js";`)

In `tests/client.test.ts` add to the first test:

```ts
    expect(c.user).toBeInstanceOf(UserApi);
    expect(c.tags).toBeInstanceOf(TagsApi);
    expect(c.portfolios).toBeInstanceOf(PortfoliosApi);
    expect(typeof c.workspace.get).toBe("function");
```

with imports `import { UserApi } from "../src/api/user.js"; import { TagsApi } from "../src/api/tags.js"; import { PortfoliosApi } from "../src/api/portfolios.js";`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/api tests/client.test.ts`
Expected: FAIL — modules not found; `get is not a function`.

- [ ] **Step 4: Implement**

Create `src/api/tags.ts`:

```ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { NewTag, Tag, TagUpdate } from "./types.js";

export interface UpdateTagOptions { tagId: number; update: TagUpdate; }

const ops = operations.tags;

export function toTag(raw: any): Tag {
  return { id: Number(raw.id), title: String(raw.title ?? ""), color: String(raw.color ?? "") };
}

export class TagsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Tag[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list);
    return pickArray(json, "tags").map(toTag);
  }

  async get(tagId: number): Promise<Tag> {
    const json = await this.http.execute<{ tag: unknown }>(ops.get, { params: { tagId } });
    return toTag(json.tag);
  }

  async create(newTag: NewTag): Promise<Tag> {
    const json = await this.http.execute<{ tag: unknown }>(ops.create, { body: newTag });
    return toTag(json.tag);
  }

  // PUT answers with success only, so the tag is re-read.
  async update({ tagId, update }: UpdateTagOptions): Promise<Tag> {
    await this.http.execute(ops.update, { params: { tagId }, body: update });
    return this.get(tagId);
  }

  async remove(tagId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { tagId } });
  }
}
```

Create `src/api/portfolios.ts`:

```ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { NewPortfolio, Portfolio, PortfolioPage, PortfolioQuery } from "./types.js";

export interface UpdatePortfolioOptions { portfolioId: number; name: string; }

const ops = operations.portfolios;

export function toPortfolio(raw: any): Portfolio {
  return { id: Number(raw.id), name: String(raw.name ?? ""), parentId: raw.parentId == null ? null : Number(raw.parentId), isPrivate: Boolean(raw.isPrivate) };
}

export class PortfoliosApi {
  constructor(private http: HttpClient) {}

  async list(query: PortfolioQuery = {}): Promise<PortfolioPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    return { portfolios: pickArray(json, "data").map(toPortfolio), hasMore: Boolean(json.hasMore) };
  }

  async get(portfolioId: number): Promise<Portfolio> {
    const json = await this.http.execute<{ data: unknown }>(ops.get, { params: { portfolioId } });
    return toPortfolio(json.data);
  }

  async create(newPortfolio: NewPortfolio): Promise<Portfolio> {
    const body: Record<string, unknown> = { name: newPortfolio.name };
    if (newPortfolio.parentId !== undefined) body.parentId = newPortfolio.parentId;
    const json = await this.http.execute<{ data: unknown }>(ops.create, { body });
    return toPortfolio(json.data);
  }

  async update({ portfolioId, name }: UpdatePortfolioOptions): Promise<Portfolio> {
    const json = await this.http.execute<{ data: unknown }>(ops.update, { params: { portfolioId }, body: { name } });
    return toPortfolio(json.data);
  }

  async remove(portfolioId: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { portfolioId } });
  }
}
```

Create `src/api/user.ts`:

```ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { toProfile } from "./responses.js";
import type { Profile } from "./types.js";

export class UserApi {
  constructor(private http: HttpClient) {}

  /** The owner of the token the server runs with. */
  async me(): Promise<Profile> {
    const json = await this.http.execute<{ user: unknown }>(operations.user.me);
    return toProfile(json.user);
  }
}
```

Append to `src/api/responses.ts` (and add `Profile` to its type import):

```ts
export function toProfile(raw: any): Profile {
  return {
    ...toMember(raw),
    email: String(raw.email ?? ""),
    language: raw.language == null ? null : String(raw.language),
    timeZone: raw.timeZone == null ? null : String(raw.timeZone),
  };
}
```

In `src/api/workspace.ts` add `Workspace` to the type import and this method:

```ts
  async get(): Promise<Workspace> {
    const json = await this.http.execute<{ workspace: any }>(operations.workspace.get);
    const raw = json.workspace ?? {};
    return { id: Number(raw.id), title: String(raw.title ?? ""), description: raw.description == null ? null : String(raw.description), isPersonal: Boolean(raw.isPersonal) };
  }
```

In `src/client.ts` import `UserApi`, `TagsApi`, `PortfoliosApi`, declare `readonly user: UserApi; readonly tags: TagsApi; readonly portfolios: PortfoliosApi;` and construct them in the constructor next to the others (`this.user = new UserApi(http);` etc.).

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/api src/client.ts tests/api tests/client.test.ts
git commit -m "feat(api): tags, portfolios, workspace and profile clients"
```

---

### Task 7: Resolver — typed kinds, a search strategy, `tag` and `portfolio`, and `forget`

**Files:**
- Modify: `src/cache.ts` (`invalidatePrefix`)
- Modify: `src/resolver.ts`
- Test: `tests/cache.test.ts`, `tests/resolver.test.ts`

**Interfaces:**
- Consumes: `client.tags.list()`, `client.portfolios.list({ search, limit })` (Task 6).
- Produces: `NameCache.invalidatePrefix(prefix)`; `Resolver.resolve({ kind: "tag" | "portfolio", value })` (both integer ids); `Resolver.forget({ kind, scope? })` — the method every write tool calls for the kinds it dirtied; `KindName` now `"project" | "board" | "column" | "member" | "tag" | "portfolio"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cache.test.ts` inside `describe("NameCache")`:

```ts
  it("invalidatePrefix drops the key itself and every scoped key under it, not look-alikes", async () => {
    const cache = new NameCache(100000, () => 0);
    const load = vi.fn(async () => []);
    await cache.get("boards:1", load);
    await cache.get("boards:1:x", load);
    await cache.get("boards:10", load);
    cache.invalidatePrefix("boards:1");
    await cache.get("boards:1", load);
    await cache.get("boards:1:x", load);
    await cache.get("boards:10", load);
    expect(load).toHaveBeenCalledTimes(5);
  });
```

Append to `tests/resolver.test.ts` inside `describe("Resolver.resolve")`:

```ts
  it("passes a numeric id through for a scoped kind without needing the scope", async () => {
    const list = vi.fn();
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    expect(await r.resolve({ kind: "board", value: "10" })).toBe(10);
    expect(list).not.toHaveBeenCalled();
  });

  it("trims whitespace around a UUID before passing it through", async () => {
    const uuid = "a2318d51-46cd-42a9-bab4-554c80824574";
    const r = new Resolver(clientWith({ workspace: { listMembers: vi.fn() } }), freshCache());
    expect(await r.resolve({ kind: "member", value: `  ${uuid} ` })).toBe(uuid);
  });

  it("caps substring candidates at five", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `Ops ${i + 1}` }));
    const r = new Resolver(clientWith({ projects: { list: async () => many } }), freshCache());
    await expect(r.resolve({ kind: "project", value: "ops" })).rejects.toMatchObject({ candidates: many.slice(0, 5) });
  });

  it("names both scopes a column can be resolved in", async () => {
    const r = new Resolver(clientWith({ columns: { list: async () => [] } }), freshCache());
    await expect(r.resolve({ kind: "column", value: "Done" })).rejects.toThrow(/needs boardId or projectId/);
  });

  it("resolves a tag by its title", async () => {
    const r = new Resolver(clientWith({ tags: { list: async () => [{ id: 5, title: "Urgent", color: "#f00" }] } }), freshCache());
    expect(await r.resolve({ kind: "tag", value: "urgent" })).toBe(5);
  });

  it("resolves a portfolio through the server-side search, bounded and cached per query", async () => {
    const list = vi.fn(async (_query: { search: string; limit: number }) => ({ portfolios: [{ id: 7, name: "Clients", parentId: null, isPrivate: false }], hasMore: false }));
    const r = new Resolver(clientWith({ portfolios: { list } }), freshCache());
    expect(await r.resolve({ kind: "portfolio", value: "Clients" })).toBe(7);
    expect(await r.resolve({ kind: "portfolio", value: "clients" })).toBe(7);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ search: "Clients", limit: 50 });
  });

  it("forget makes the next resolve reload that kind in that scope", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    r.forget({ kind: "board", scope: { projectId: 1 } });
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("forget on a search kind drops every cached query", async () => {
    const list = vi.fn(async () => ({ portfolios: [{ id: 7, name: "Clients", parentId: null, isPrivate: false }], hasMore: false }));
    const r = new Resolver(clientWith({ portfolios: { list } }), freshCache());
    await r.resolve({ kind: "portfolio", value: "Clients" });
    r.forget({ kind: "portfolio" });
    await r.resolve({ kind: "portfolio", value: "Clients" });
    expect(list).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cache.test.ts tests/resolver.test.ts`
Expected: FAIL — `invalidatePrefix is not a function`; the five-candidate and "needs boardId or projectId" cases may already pass (they restore coverage Phase 1 dropped); `tag`/`portfolio`/`forget` fail.

- [ ] **Step 3: Implement**

In `src/cache.ts` add after `invalidate`:

```ts
  /** Drops `prefix` and every key scoped under it (`prefix:…`); `boards:1` does not touch `boards:10`. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) this.store.delete(key);
    }
  }
```

Replace `src/resolver.ts` with:

```ts
import type { WeeekClient } from "./client.js";
import type { NameCache } from "./cache.js";
import { ResolutionError, type Candidate } from "./errors.js";

export const idShapes = ["integer", "uuid"] as const;
export type IdShape = (typeof idShapes)[number];
export const loadStrategies = ["list", "search"] as const;
export type LoadStrategy = (typeof loadStrategies)[number];

// A server-side search is never paged in full: this many candidates is plenty to pick one
// exact match from or to show as suggestions.
const searchPageSize = 50;

export interface Named<Id extends number | string> { id: Id; name: string; }
export interface ResolveScope { projectId?: number; boardId?: number; }

/** What the resolver needs to know about one kind of named thing. */
interface KindBase<Id extends number | string> {
  /** The word used in error messages — the tool parameter's name, not the API's. */
  label: string;
  /** "list" loads the whole (small) collection once; "search" asks the API for the query and caches per query. */
  strategy: LoadStrategy;
  /** Cache prefix; must include every scope id the load depends on. A search kind caches under `${prefix}:${query}`. */
  cacheKey(scope: ResolveScope): string;
  load(client: WeeekClient, scope: ResolveScope, query: string): Promise<Array<Named<Id>>>;
}
// The shape names the id type, so a kind cannot declare uuid ids and load numeric ones.
interface IntegerKind extends KindBase<number> { shape: "integer"; }
interface UuidKind extends KindBase<string> { shape: "uuid"; }
type Kind = IntegerKind | UuidKind;

interface KindTable {
  project: IntegerKind;
  board: IntegerKind;
  column: IntegerKind;
  member: UuidKind;
  tag: IntegerKind;
  portfolio: IntegerKind;
}
export type KindName = keyof KindTable;
type IdOf<K extends KindName> = KindTable[K] extends IntegerKind ? number : string;

export interface ResolveOptions<K extends KindName> {
  kind: K;
  value: string | number;
  scope?: ResolveScope;
}
export interface ForgetOptions { kind: KindName; scope?: ResolveScope; }

const INTEGER_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireScope<T>(value: T | undefined, label: string, field: string): T {
  if (value === undefined) throw new Error(`resolving a ${label} by name needs ${field}`);
  return value;
}

const kinds: KindTable = {
  project: {
    shape: "integer", label: "project", strategy: "list",
    cacheKey: () => "projects",
    load: (client) => client.projects.list(),
  },
  board: {
    shape: "integer", label: "board", strategy: "list",
    cacheKey: (scope) => `boards:${requireScope(scope.projectId, "board", "projectId")}`,
    load: (client, scope) => client.boards.list(requireScope(scope.projectId, "board", "projectId")),
  },
  column: {
    shape: "integer", label: "column", strategy: "list",
    cacheKey: (scope) => scope.boardId !== undefined
      ? `board-columns:${scope.boardId}`
      : `columns:${requireScope(scope.projectId, "column", "boardId or projectId")}`,
    load: async (client, scope) => {
      if (scope.boardId !== undefined) return client.columns.list(scope.boardId);
      const boards = await client.boards.list(requireScope(scope.projectId, "column", "boardId or projectId"));
      const all: Named<number>[] = [];
      for (const board of boards) all.push(...(await client.columns.list(board.id)));
      return all;
    },
  },
  member: {
    shape: "uuid", label: "assignee", strategy: "list",
    cacheKey: () => "members",
    load: (client) => client.workspace.listMembers(),
  },
  tag: {
    shape: "integer", label: "tag", strategy: "list",
    cacheKey: () => "tags",
    // Tags carry `title`, not `name`; the resolver only ever matches on `name`.
    load: async (client) => (await client.tags.list()).map((tag) => ({ id: tag.id, name: tag.title })),
  },
  portfolio: {
    shape: "integer", label: "portfolio", strategy: "search",
    cacheKey: () => "portfolios",
    load: async (client, _scope, query) => (await client.portfolios.list({ search: query, limit: searchPageSize })).portfolios,
  },
};

export class Resolver {
  constructor(private client: WeeekClient, private cache: NameCache) {}

  static pickUnique<I extends number | string>(kind: string, query: string, list: Array<Named<I>>): I {
    const q = query.trim().toLowerCase();
    const exact = list.filter((e) => e.name.trim().toLowerCase() === q);
    if (exact.length === 1) return exact[0].id;
    const candidates: Candidate[] = (exact.length > 1
      ? exact
      : list.filter((e) => e.name.trim().toLowerCase().includes(q)).slice(0, 5)
    ).map((e) => ({ id: e.id, name: e.name }));
    throw new ResolutionError(kind, query, candidates);
  }

  async resolve<K extends KindName>({ kind, value, scope = {} }: ResolveOptions<K>): Promise<IdOf<K>> {
    const definition: Kind = kinds[kind];
    const id = Resolver.asId(definition.shape, value);
    if (id !== null) return id as IdOf<K>;
    const query = String(value).trim();
    const key = Resolver.cacheKeyFor(definition, scope, query);
    const list = (await this.cache.get(key, () => definition.load(this.client, scope, query))) as unknown as Array<Named<IdOf<K>>>;
    return Resolver.pickUnique<IdOf<K>>(definition.label, query, list);
  }

  /** Called by a write tool for every kind its write dirtied, so the next name lookup sees the change. */
  forget({ kind, scope = {} }: ForgetOptions): void {
    this.cache.invalidatePrefix(kinds[kind].cacheKey(scope));
  }

  private static cacheKeyFor(definition: Kind, scope: ResolveScope, query: string): string {
    const prefix = definition.cacheKey(scope);
    if (definition.strategy === "list") return prefix;
    if (definition.strategy === "search") return `${prefix}:${query.toLowerCase()}`;
    const _exhaustive: never = definition.strategy;
    throw new Error(`unhandled load strategy ${String(_exhaustive)}`);
  }

  private static asId(shape: IdShape, value: string | number): number | string | null {
    if (shape === "integer") {
      if (typeof value === "number") return value;
      return INTEGER_RE.test(value.trim()) ? Number(value.trim()) : null;
    }
    if (shape === "uuid") {
      if (typeof value === "number") return String(value);
      return UUID_RE.test(value.trim()) ? value.trim() : null;
    }
    const _exhaustive: never = shape;
    throw new Error(`unhandled id shape ${String(_exhaustive)}`);
  }
}
```

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm test`
Expected: PASS. The `"Clients"`/`"clients"` test proves the per-query cache key is case-folded while the API receives the user's spelling.

- [ ] **Step 5: Update FOLLOWUPS #20**

Strike the "Tie `Kind.shape` to the id type" bullet (` — RESOLVED (Phase 2, Task 7)`) and the "Restore the resolver cases dropped in Phase 1" bullet (same suffix).

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/cache.ts src/resolver.ts tests/cache.test.ts tests/resolver.test.ts docs/FOLLOWUPS.md
git commit -m "feat(resolver): tag and portfolio kinds, search strategy and forget()"
```

---

### Task 8: Tool building blocks; the task tools grow

The pieces every Phase 2 tool file shares, then the three existing task tools that gain parameters and the two read tools the default toolset was missing (FOLLOWUPS #14: `weeek_list_boards`, `weeek_list_columns`).

**Files:**
- Create: `src/tools/constants.ts`, `src/tools/inputs.ts`, `src/tools/json-tool.ts`
- Modify: `src/dates.ts` (`parseDueDate` → `parseDay`), `tests/dates.test.ts`
- Modify: `src/tools/tasks.ts`
- Create: `tests/helpers/tool-harness.ts`
- Rename: `tests/helpers/default-tool-names.ts` → `tests/helpers/tool-names.ts` (update the two imports in `tests/server.test.ts` and `tests/toolsets/register.test.ts`)
- Test: `tests/tools/tasks.test.ts`

**Interfaces:**
- Consumes: `taskPriorities`, `taskTypes`, `priorityCode` (Task 3), `apiFlag` (Task 5), `resolver.resolve({ kind: "tag" })` (Task 7), `client.boards.list`, `client.columns.list`.
- Produces: `destructiveAnnotations`; `nameOrId`, `nameOrIdList`, `confirmation`, `taskId`, `dayMonthYear`, `page`; `registerJsonTool(server, name, { description, inputSchema, annotations? }, run)`; `parseDay(input, now?)`; `buildTaskPatch(resolver, input)`, `buildTaskQuery(args)`; test helpers `toolHarness(register, clientStub)` returning `{ call, cache, resolver, handlers }`, `reply(res)`; `defaultToolNames` (now 15 entries: the 13 of 0.5.0 + `weeek_list_boards` + `weeek_list_columns`).

- [ ] **Step 1: The shared pieces**

Create `src/tools/constants.ts`:

```ts
// Every tool that deletes, archives or detaches carries these and gates on `confirmation`
// (src/tools/inputs.ts); tests/tool-quality.test.ts enforces the pair by tool name.
export const destructiveAnnotations = { destructiveHint: true, idempotentHint: false } as const;
```

Create `src/tools/inputs.ts`:

```ts
import { z } from "zod";

/** A reference the resolver turns into an id: the thing's name, or its id passed straight through. */
export const nameOrId = z.union([z.string(), z.number()]);
export const nameOrIdList = z.array(nameOrId).min(1).max(50);
/** The gate on every destructive tool: the schema rejects the call unless confirm is literally true. */
export const confirmation = z.literal(true).describe("Must be true to confirm this irreversible action.");
export const taskId = z.number().int();
/** The API's date filters are dd.mm.yyyy. */
export const dayMonthYear = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "expected dd.mm.yyyy");
export const page = {
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
};
```

Create `src/tools/json-tool.ts`:

```ts
import type { z, ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { jsonReply, errorReply } from "./reply.js";

export interface JsonToolConfig<Shape extends ZodRawShape> {
  description: string;
  inputSchema: Shape;
  annotations?: ToolAnnotations;
}

/**
 * Registers a tool whose handler returns the value to serialise, or throws. Every throw — a
 * ResolutionError with its candidates, an API error, a bad argument — becomes an error reply,
 * so a handler holds only its happy path. Positional like the SDK's registerTool it wraps.
 */
export function registerJsonTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  config: JsonToolConfig<Shape>,
  run: (args: z.objectOutputType<Shape, z.ZodTypeAny>) => Promise<unknown>,
): void {
  server.registerTool(name, config, async (args) => {
    try {
      return jsonReply(await run(args));
    } catch (err) {
      return errorReply(err);
    }
  });
}
```

In `src/dates.ts` rename `parseDueDate` to `parseDay` (it now also parses start dates and time-entry dates; the result is still `Y-m-d`). In `tests/dates.test.ts` rename every `parseDueDate` to `parseDay` and the `describe` title to `"parseDay"`.

Create `tests/helpers/tool-harness.ts`:

```ts
import { vi } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import type { ToolContext } from "../../src/toolsets/types.js";

type ToolHandler = (rawArgs: unknown) => Promise<any>;

/**
 * Registers one tool group against a stub client and hands back a `call(name, args)` that
 * replays the real server's step of parsing raw args against the tool's zod shape, so
 * defaults, enums and `confirm` gates are exercised the way a client would hit them.
 */
export function toolHarness(register: (ctx: ToolContext) => void, clientStub: Record<string, unknown>) {
  const client = clientStub as any;
  const cache = new NameCache(100_000, () => 0);
  const resolver = new Resolver(client, cache);
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, ToolHandler>();
  vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
    const schema = z.object(config?.inputSchema ?? {});
    handlers.set(name, (rawArgs: unknown) => cb(schema.parse(rawArgs)));
    return undefined as any;
  }) as any);
  register({ server, client, resolver, cache, attachPolicy: { attachDir: "/allowed", maxBytes: 1000 }, readPolicy: { maxBytes: 1024 } });
  const call = (name: string, args: unknown) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no tool named ${name} was registered`);
    return handler(args);
  };
  return { call, cache, resolver, handlers };
}

/** The JSON a tool replied with. */
export const reply = (res: any) => JSON.parse(res.content[0].text);

/** Members every name-taking test can resolve against. */
export const stubMembers = [{ id: "a2318d51-46cd-42a9-bab4-554c80824574", name: "Ilya" }, { id: "b2318d51-46cd-42a9-bab4-554c80824574", name: "Ann" }];
```

Rename `tests/helpers/default-tool-names.ts` to `tests/helpers/tool-names.ts` (`git mv`) with this content; later tasks append to it:

```ts
// The exact surface of each toolset. A rename or an accidental drop fails here on purpose.
export const defaultToolNames = [
  "weeek_version",
  "weeek_list_projects", "weeek_list_tasks", "weeek_get_task", "weeek_get_attachment", "weeek_list_members",
  "weeek_create_task", "weeek_create_tasks", "weeek_update_task", "weeek_delete_task",
  "weeek_attach_file", "weeek_move_task", "weeek_complete_task",
  "weeek_list_boards", "weeek_list_columns",
].sort();
```

Change the import path in `tests/server.test.ts` and `tests/toolsets/register.test.ts` to `"./helpers/tool-names.js"` / `"../helpers/tool-names.js"`.

- [ ] **Step 2: Write the failing tests**

Append to `tests/tools/tasks.test.ts` inside `describe("task tools")`:

```ts
  it("weeek_list_tasks forwards the Phase 2 filters as the API spells them", async () => {
    const list = vi.fn(async () => []);
    const h = harness({ tasks: { list } });
    await h.get("weeek_list_tasks")!({ all: true, search: "deploy", priority: "high", type: "call", boardId: 3, boardColumnId: 30, day: "01.08.2026", completedAtFrom: "01.07.2026", completedAtTo: "31.07.2026" });
    expect(list.mock.calls[0][0]).toMatchObject({ all: 1, search: "deploy", priority: 2, type: "call", boardId: 3, boardColumnId: 30, day: "01.08.2026", completedAtFrom: "01.07.2026", completedAtTo: "31.07.2026" });
  });

  it("weeek_list_tasks rejects a priority outside the four names", async () => {
    const h = harness({ tasks: { list: vi.fn() } });
    await expect(h.get("weeek_list_tasks")!({ priority: "urgent" })).rejects.toThrow();
  });

  it("create_task sends the priority code, the type and the parent", async () => {
    const create = vi.fn(async (b: any) => ({ id: 5, ...b }));
    const h = harness({ ...baseClient, tasks: { create } });
    await h.get("weeek_create_task")!({ title: "Sub", project: "Marketing", priority: "hold", type: "meet", parent: 70 });
    expect(create).toHaveBeenCalledWith({ title: "Sub", projectId: 1, priority: 3, type: "meet", parentId: 70 });
  });

  it("update_task resolves tags by name and sends the new fields only when given", async () => {
    const update = vi.fn(async (id: number, patch: any) => ({ id, ...patch }));
    const h = harness({ ...baseClient, tags: { list: async () => [{ id: 5, title: "Urgent", color: "#f00" }] }, tasks: { update } });
    await h.get("weeek_update_task")!({ id: 3, tags: ["urgent", 6], priority: "high", type: "call", duration: 90, start: "2026-08-01" });
    expect(update).toHaveBeenCalledWith(3, { tags: [5, 6], priority: 2, type: "call", duration: 90, startDate: "2026-08-01" });
  });

  it("weeek_list_boards resolves the project by name", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main", projectId: 1, isPrivate: false }]);
    const h = harness({ ...baseClient, boards: { list } });
    const res = await h.get("weeek_list_boards")!({ project: "marketing" });
    expect(list).toHaveBeenCalledWith(1);
    expect(JSON.parse(res.content[0].text)).toEqual([{ id: 10, name: "Main", projectId: 1, isPrivate: false }]);
  });

  it("weeek_list_columns takes a board id, or a board name with its project", async () => {
    const list = vi.fn(async (_bid: number) => [{ id: 100, name: "Done", boardId: 10 }]);
    const h = harness({ ...baseClient, columns: { list } });
    await h.get("weeek_list_columns")!({ board: 10 });
    expect(list).toHaveBeenLastCalledWith(10);
    await h.get("weeek_list_columns")!({ board: "main", project: "Marketing" });
    expect(list).toHaveBeenLastCalledWith(10);
  });

  it("weeek_list_columns refuses a board name without a project instead of guessing", async () => {
    const list = vi.fn();
    const h = harness({ ...baseClient, columns: { list } });
    const res = await h.get("weeek_list_columns")!({ board: "Main" });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toMatch(/needs projectId/);
    expect(list).not.toHaveBeenCalled();
  });
```

(`harness` and `baseClient` are the file's existing helpers; `baseClient.boards.list` returns `[{ id: 10, name: "Main" }]`, which the board-name test relies on.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/tools/tasks.test.ts tests/dates.test.ts`
Expected: FAIL — `parseDay` not exported; unknown keys are stripped by zod so `all`/`search` never reach the stub; `weeek_list_boards` handler undefined.

- [ ] **Step 4: Rewrite `src/tools/tasks.ts`**

```ts
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolContext } from "../toolsets/types.js";
import type { NewTask, TaskPriority, TaskType, WeeekTask } from "../client.js";
import type { Resolver } from "../resolver.js";
import { resolveSafeAttachPath } from "../attach.js";
import { parseDay } from "../dates.js";
import { taskPriorities, taskTypes } from "../api/constants.js";
import { priorityCode } from "../api/priority.js";
import { apiFlag } from "../api/requests.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, dayMonthYear, nameOrId, nameOrIdList, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { jsonReply, imageReply, errorReply } from "./reply.js";

// Upper bound on auto-pagination: even with the required userId + date range, a
// wide range must not loop unbounded or build a response too large for the caller.
// On overflow we throw rather than silently truncate, so the caller narrows the range.
export const MAX_AUTO_PAGES = 20;

// An attachment id goes straight into the request path, and it reaches this tool from
// untrusted task text via the model. Restricting it to id characters keeps the path
// from being steered elsewhere; the API declares file_id as a plain string, so this
// deliberately does not demand a uuid it never promised.
const ATTACHMENT_ID = /^[A-Za-z0-9_-]+$/;

interface CreateInput {
  title: string; project: string | number;
  column?: string | number; assignee?: string | number;
  due?: string; description?: string;
  priority?: TaskPriority; type?: TaskType; parent?: number;
}

export async function buildNewTask(resolver: Resolver, input: CreateInput): Promise<NewTask> {
  const projectId = await resolver.resolve({ kind: "project", value: input.project });
  const newTask: NewTask = { title: input.title, projectId };
  if (input.column !== undefined) newTask.boardColumnId = await resolver.resolve({ kind: "column", value: input.column, scope: { projectId } });
  if (input.assignee !== undefined) newTask.userId = await resolver.resolve({ kind: "member", value: input.assignee });
  if (input.due !== undefined) newTask.dayFrom = parseDay(input.due);
  if (input.description !== undefined) newTask.description = input.description;
  if (input.priority !== undefined) newTask.priority = priorityCode(input.priority);
  if (input.type !== undefined) newTask.type = input.type;
  if (input.parent !== undefined) newTask.parentId = input.parent;
  return newTask;
}

interface UpdateInput {
  title?: string; due?: string; start?: string;
  priority?: TaskPriority; type?: TaskType; duration?: number;
  tags?: Array<string | number>;
}

/** The PUT body for weeek_update_task: only the fields given, names resolved to ids. */
export async function buildTaskPatch(resolver: Resolver, input: UpdateInput): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  // `dayFrom` has set the due date since 0.1 although the spec names the field `dueDate`;
  // the Phase 2 live smoke settles which one the API honours (FOLLOWUPS).
  if (input.due !== undefined) patch.dayFrom = parseDay(input.due);
  if (input.start !== undefined) patch.startDate = parseDay(input.start);
  if (input.priority !== undefined) patch.priority = priorityCode(input.priority);
  if (input.type !== undefined) patch.type = input.type;
  if (input.duration !== undefined) patch.duration = input.duration;
  if (input.tags !== undefined) patch.tags = await Promise.all(input.tags.map((value) => resolver.resolve({ kind: "tag", value })));
  return patch;
}

const createShape = {
  title: z.string(),
  project: nameOrId,
  column: nameOrId.optional(),
  assignee: nameOrId.optional(),
  due: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(taskPriorities).optional(),
  type: z.enum(taskTypes).optional(),
  parent: z.number().int().optional().describe("Id of the task this one becomes a subtask of."),
};

const listShape = {
  projectId: z.number().int().optional(),
  boardId: z.number().int().optional(),
  boardColumnId: z.number().int().optional(),
  userId: z.string().uuid().optional(),
  completed: z.boolean().optional(),
  all: z.boolean().optional().describe("Include completed and deleted tasks; when set, `completed` is ignored."),
  search: z.string().min(1).optional().describe("Text to find in titles and descriptions."),
  priority: z.enum(taskPriorities).optional(),
  type: z.enum(taskTypes).optional(),
  day: dayMonthYear.optional(),
  startDate: dayMonthYear.optional(),
  endDate: dayMonthYear.optional(),
  completedAtFrom: dayMonthYear.optional(),
  completedAtTo: dayMonthYear.optional(),
  sortBy: z.enum(["name", "type", "priority", "duration", "overdue", "created", "date", "start"]).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  allPages: z.boolean().default(false),
};
type ListArgs = z.infer<z.ZodObject<typeof listShape>>;

/** The server-side filters of weeek_list_tasks as the API spells them; paging is added by the caller. */
export function buildTaskQuery(args: ListArgs): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  if (args.projectId !== undefined) query.projectId = args.projectId;
  if (args.boardId !== undefined) query.boardId = args.boardId;
  if (args.boardColumnId !== undefined) query.boardColumnId = args.boardColumnId;
  if (args.userId !== undefined) query.userId = args.userId;
  if (args.completed !== undefined) query.completed = apiFlag(args.completed);
  if (args.all !== undefined) query.all = apiFlag(args.all);
  if (args.search !== undefined) query.search = args.search;
  if (args.priority !== undefined) query.priority = priorityCode(args.priority);
  if (args.type !== undefined) query.type = args.type;
  if (args.day !== undefined) query.day = args.day;
  if (args.startDate !== undefined) query.startDate = args.startDate;
  if (args.endDate !== undefined) query.endDate = args.endDate;
  if (args.completedAtFrom !== undefined) query.completedAtFrom = args.completedAtFrom;
  if (args.completedAtTo !== undefined) query.completedAtTo = args.completedAtTo;
  if (args.sortBy !== undefined) query.sortBy = args.sortBy;
  return query;
}

export function registerTaskTools({ server, client, resolver, attachPolicy, readPolicy }: ToolContext): void {
  registerJsonTool(server, "weeek_list_projects", {
    description: "List WEEEK projects: id, name, description, privacy, status, portfolio and team member ids.",
    inputSchema: {},
  }, async () => client.projects.list());

  registerJsonTool(server, "weeek_list_boards", {
    description: "List the boards of a WEEEK project (by name or id): id, name, privacy. Use it to find a board for weeek_move_task or weeek_list_columns.",
    inputSchema: { project: nameOrId },
  }, async (args) => client.boards.list(await resolver.resolve({ kind: "project", value: args.project })));

  registerJsonTool(server, "weeek_list_columns", {
    description: "List the columns of a WEEEK board: id, name, boardId. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional() },
  }, async (args) => {
    const projectId = args.project === undefined ? undefined : await resolver.resolve({ kind: "project", value: args.project });
    const boardId = await resolver.resolve({ kind: "board", value: args.board, scope: { projectId } });
    return client.columns.list(boardId);
  });

  registerJsonTool(server, "weeek_list_tasks", {
    description:
      "List WEEEK tasks with server-side filters: project, board, column, assignee (userId), completion, free-text `search`, priority, type, a single `day` or a startDate–endDate range (dd.mm.yyyy), completion dates. Set allPages=true together with userId, startDate, and endDate to fetch every matching page inside the connector without returning unrelated workspace pages.",
    inputSchema: listShape,
  }, async (args) => {
    if ((args.startDate === undefined) !== (args.endDate === undefined)) {
      throw new Error("startDate and endDate must be provided together");
    }
    const query = buildTaskQuery(args);
    if (!args.allPages) return client.tasks.list({ ...query, perPage: args.limit, offset: args.offset });
    if (!args.userId || !args.startDate || !args.endDate) {
      throw new Error("allPages requires userId, startDate, and endDate so the connector never scans the full workspace");
    }
    const tasks: WeeekTask[] = [];
    let offset = args.offset;
    for (let page = 0; page < MAX_AUTO_PAGES; page++) {
      const batch = await client.tasks.list({ ...query, perPage: args.limit, offset });
      tasks.push(...batch);
      if (batch.length < args.limit) return tasks;
      offset += args.limit;
    }
    throw new Error(`allPages exceeded ${MAX_AUTO_PAGES} pages; narrow startDate/endDate to reduce the result set`);
  });

  registerJsonTool(server, "weeek_get_task", {
    description: "Get one WEEEK task by id: assignees, watchers, parent and subtasks, priority, dates, tags, locations, time entries and attachments.",
    inputSchema: { id: taskId },
  }, async (args) => client.tasks.get(args.id));

  server.registerTool(
    "weeek_get_attachment",
    {
      description:
        "Read one WEEEK attachment by id. For an image WEEEK hosts itself this returns the image, so a task whose requirements live in a screenshot can actually be read instead of guessed at from the surrounding text; anything else comes back as metadata. Ids come from a task's `attachments` list (weeek_get_task).",
      inputSchema: {
        id: z.string().regex(ATTACHMENT_ID, "attachment id must be an id, not a path"),
        metadataOnly: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        const attachment = await client.attachments.get(args.id);
        if (args.metadataOnly) return jsonReply({ attachment });
        if (attachment.service !== "weeek") {
          return jsonReply({
            attachment,
            note: `stored in ${attachment.service}, not in WEEEK; open its url directly — only weeek-hosted attachments can be read through this tool`,
          });
        }
        const { bytes, contentType } = await client.attachments.download({
          attachment,
          maxBytes: readPolicy.maxBytes,
        });
        // Never dump a binary into the conversation: only an image earns its bytes.
        if (!contentType.startsWith("image/")) {
          return jsonReply({ attachment, note: `not an image (${contentType}); its bytes are not returned` });
        }
        return imageReply(bytes, contentType);
      } catch (err) { return errorReply(err); }
    },
  );

  registerJsonTool(server, "weeek_list_members", {
    description:
      "List WEEEK workspace members (id + display name). Any tool that takes an assignee, watcher or member accepts these names directly; use this to see who exists.",
    inputSchema: {},
  }, async () => client.workspace.listMembers());

  registerJsonTool(server, "weeek_create_task", {
    description:
      "Create a WEEEK task. Accepts project/column/assignee by NAME or id, a natural-language `due` date, a priority (low, medium, high, hold), a type (action, meet, call) and a `parent` task id for a subtask. One call — no need to look up ids first. Omit `assignee` to self-assign; to change assignees later use weeek_add_assignees / weeek_remove_assignees.",
    inputSchema: createShape,
  }, async (args) => client.tasks.create(await buildNewTask(resolver, args)));

  server.registerTool(
    "weeek_create_tasks",
    {
      description: "Create many WEEEK tasks in one call. Returns a per-item report; one bad name does not abort the batch.",
      inputSchema: { tasks: z.array(z.object(createShape)).min(1).max(50) },
    },
    async (args) => {
      const report: Array<{ ok: boolean; task?: unknown; error?: string; candidates?: unknown }> = [];
      for (const t of args.tasks) {
        try {
          const newTask = await buildNewTask(resolver, t);
          report.push({ ok: true, task: await client.tasks.create(newTask) });
        } catch (err) {
          const e = err as { name?: string; message?: string };
          const entry: { ok: false; error: string; candidates?: unknown } = { ok: false, error: e.message ?? String(err) };
          if (e.name === "ResolutionError") entry.candidates = (err as any).candidates;
          report.push(entry);
        }
      }
      return jsonReply(report);
    },
  );

  registerJsonTool(server, "weeek_update_task", {
    description:
      "Update a WEEEK task: title, natural-language `due` and `start` dates, priority (low, medium, high, hold), type (action, meet, call), `duration` estimate in minutes, and `tags` by name or id (replaces the task's tags). NOTE: description is NOT updatable — WEEEK's API silently ignores it on update; set it at create time or in the UI. Assignees, watchers, parent and projects have their own tools.",
    inputSchema: {
      id: taskId,
      title: z.string().optional(),
      due: z.string().optional(),
      start: z.string().optional(),
      priority: z.enum(taskPriorities).optional(),
      type: z.enum(taskTypes).optional(),
      duration: z.number().int().min(0).optional(),
      tags: nameOrIdList.optional(),
    },
  }, async (args) => client.tasks.update(args.id, await buildTaskPatch(resolver, args)));

  registerJsonTool(server, "weeek_delete_task", {
    description:
      "Permanently delete a WEEEK task by id. Irreversible — the task is removed, not just completed. Requires confirm:true; to merely close a task use weeek_complete_task instead.",
    inputSchema: { id: taskId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.remove(args.id));

  registerJsonTool(server, "weeek_attach_file", {
    description:
      "Attach a local file to a WEEEK task. For safety only files inside the allowed directory (the server's working directory by default, or WEEEK_ATTACH_DIR if set) — and its subfolders — may be attached; paths outside it are refused.",
    inputSchema: { task_id: taskId, path: z.string() },
    annotations: { openWorldHint: true },
  }, async (args) => {
    const safePath = await resolveSafeAttachPath(args.path, attachPolicy);
    const bytes = await readFile(safePath);
    return client.tasks.uploadAttachment({ taskId: args.task_id, filename: basename(safePath), bytes });
  });

  registerJsonTool(server, "weeek_move_task", {
    description: "Move a WEEEK task to a column (by name or id, scoped to the given board) on that board. Find board ids with weeek_list_boards.",
    inputSchema: { id: taskId, board_id: z.number().int(), column: nameOrId },
  }, async (args) => {
    const columnId = await resolver.resolve({ kind: "column", value: args.column, scope: { boardId: args.board_id } });
    return client.tasks.move({ taskId: args.id, boardId: args.board_id, boardColumnId: columnId });
  });

  registerJsonTool(server, "weeek_complete_task", {
    description: "Mark a WEEEK task complete, or reopen it (completed:false).",
    inputSchema: { id: taskId, completed: z.boolean() },
  }, async (args) => client.tasks.setCompleted({ taskId: args.id, completed: args.completed }));
}
```

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm test`
Expected: PASS, including every pre-existing test in `tests/tools/tasks.test.ts` (the `create`/`update`/`delete`/`list` stubs see the same calls as before) and `tests/toolsets/register.test.ts` against the grown `defaultToolNames`.

If `tsc` rejects `registerJsonTool`'s `config` or types `args` as `unknown` inside its callbacks, open `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts`, find `registerTool`, and give `registerJsonTool` the same generic bound for `Shape` and the same `args` type its `ToolCallback` uses; the wrapper must mirror the SDK, not re-derive it.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/tools src/dates.ts tests/dates.test.ts tests/helpers tests/tools/tasks.test.ts tests/server.test.ts tests/toolsets/register.test.ts
git commit -m "feat(tools): list boards and columns; priority, type, parent, start, duration and tags on tasks"
```

---

### Task 9: Comment and task-link tools in the default toolset

**Files:**
- Create: `src/tools/comments.ts`, `src/tools/task-links.ts`
- Modify: `src/toolsets/register.ts` (the `tasks` registrar composes three files)
- Modify: `tests/helpers/tool-names.ts`
- Test: `tests/tools/comments.test.ts`, `tests/tools/task-links.test.ts`

**Interfaces:**
- Consumes: `TasksApi.{listComments,addComment,removeComment,addAssignees,removeAssignees,addWatchers,removeWatchers,addLocation,removeLocation,setParent}` (Task 3), `registerJsonTool`, `inputs`, `destructiveAnnotations` (Task 8).
- Produces: `registerCommentTools(ctx)` — `weeek_list_comments`, `weeek_add_comment`, `weeek_delete_comment`; `registerTaskLinkTools(ctx)` — `weeek_add_assignees`, `weeek_remove_assignees`, `weeek_add_watchers`, `weeek_remove_watchers`, `weeek_add_task_to_project`, `weeek_remove_task_from_project`, `weeek_set_task_parent`. `defaultToolNames` grows to 25.

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/comments.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { registerCommentTools } from "../../src/tools/comments.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const comment = { id: 9, parentId: null, authorId: "u1", markdown: "hi", createdAt: "x", updatedAt: "x" };

describe("comment tools", () => {
  it("weeek_list_comments pages with the defaults", async () => {
    const listComments = vi.fn(async () => ({ comments: [comment], hasMore: false }));
    const h = toolHarness(registerCommentTools, { tasks: { listComments } });
    expect(reply(await h.call("weeek_list_comments", { id: 78 }))).toEqual({ comments: [comment], hasMore: false });
    expect(listComments).toHaveBeenCalledWith({ taskId: 78, limit: 20, offset: 0 });
  });

  it("weeek_add_comment posts markdown, replying when reply_to is given", async () => {
    const addComment = vi.fn(async () => comment);
    const h = toolHarness(registerCommentTools, { tasks: { addComment } });
    await h.call("weeek_add_comment", { id: 78, markdown: "hi" });
    expect(addComment).toHaveBeenCalledWith({ taskId: 78, markdown: "hi", parentId: undefined });
    await h.call("weeek_add_comment", { id: 78, markdown: "re", reply_to: 9 });
    expect(addComment).toHaveBeenLastCalledWith({ taskId: 78, markdown: "re", parentId: 9 });
  });

  it("weeek_delete_comment needs confirm:true and then deletes", async () => {
    const removeComment = vi.fn(async () => undefined);
    const h = toolHarness(registerCommentTools, { tasks: { removeComment } });
    await expect(h.call("weeek_delete_comment", { id: 78, comment_id: 9 })).rejects.toThrow();
    expect(removeComment).not.toHaveBeenCalled();
    expect(reply(await h.call("weeek_delete_comment", { id: 78, comment_id: 9, confirm: true }))).toEqual({ success: true });
    expect(removeComment).toHaveBeenCalledWith({ taskId: 78, commentId: 9 });
  });

  it("weeek_add_comment turns a client failure into an error reply", async () => {
    const h = toolHarness(registerCommentTools, { tasks: { addComment: vi.fn(async () => { throw new Error("boom"); }) } });
    const res = await h.call("weeek_add_comment", { id: 78, markdown: "hi" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toBe("boom");
  });
});
```

Create `tests/tools/task-links.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { registerTaskLinkTools } from "../../src/tools/task-links.js";
import { toolHarness, reply, stubMembers } from "../helpers/tool-harness.js";

const task = { id: 78, title: "T" };
const [ilya, ann] = stubMembers;
const client = () => ({
  workspace: { listMembers: async () => stubMembers },
  projects: { list: async () => [{ id: 1, name: "Marketing" }, { id: 2, name: "Sales" }] },
  boards: { list: async () => [{ id: 10, name: "Main" }] },
  columns: { list: async () => [{ id: 100, name: "Done" }] },
});

describe("task link tools", () => {
  it.each([
    ["weeek_add_assignees", "assignees", "addAssignees"],
    ["weeek_add_watchers", "watchers", "addWatchers"],
  ])("%s resolves member names and ids, then calls %s", async (tool, field, method) => {
    const fn = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { [method]: fn } });
    expect(reply(await h.call(tool, { id: 78, [field]: ["ilya", ann.id] }))).toEqual(task);
    expect(fn).toHaveBeenCalledWith({ taskId: 78, memberIds: [ilya.id, ann.id] });
  });

  it.each([
    ["weeek_remove_assignees", "assignees", "removeAssignees"],
    ["weeek_remove_watchers", "watchers", "removeWatchers"],
  ])("%s needs confirm:true, then detaches", async (tool, field, method) => {
    const fn = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { [method]: fn } });
    await expect(h.call(tool, { id: 78, [field]: ["Ann"] })).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
    await h.call(tool, { id: 78, [field]: ["Ann"], confirm: true });
    expect(fn).toHaveBeenCalledWith({ taskId: 78, memberIds: [ann.id] });
  });

  it("weeek_add_assignees reports an unknown member with candidates instead of calling the API", async () => {
    const addAssignees = vi.fn();
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { addAssignees } });
    const res = await h.call("weeek_add_assignees", { id: 78, assignees: ["Nobody"] });
    expect(res.isError).toBe(true);
    expect(reply(res)).toMatchObject({ error: expect.stringMatching(/could not resolve assignee "Nobody"/), candidates: [] });
    expect(addAssignees).not.toHaveBeenCalled();
  });

  it("weeek_add_task_to_project resolves the project and the column inside it", async () => {
    const addLocation = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { addLocation } });
    await h.call("weeek_add_task_to_project", { id: 78, project: "sales" });
    expect(addLocation).toHaveBeenCalledWith({ taskId: 78, projectId: 2, boardColumnId: undefined });
    await h.call("weeek_add_task_to_project", { id: 78, project: "Marketing", column: "done" });
    expect(addLocation).toHaveBeenLastCalledWith({ taskId: 78, projectId: 1, boardColumnId: 100 });
  });

  it("weeek_remove_task_from_project needs confirm:true", async () => {
    const removeLocation = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { removeLocation } });
    await expect(h.call("weeek_remove_task_from_project", { id: 78, project: 2 })).rejects.toThrow();
    await h.call("weeek_remove_task_from_project", { id: 78, project: 2, confirm: true });
    expect(removeLocation).toHaveBeenCalledWith({ taskId: 78, projectId: 2 });
  });

  it("weeek_set_task_parent sends the parent id, and an explicit null to detach", async () => {
    const setParent = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { setParent } });
    await h.call("weeek_set_task_parent", { id: 80, parent: 78 });
    expect(setParent).toHaveBeenCalledWith({ taskId: 80, parentId: 78 });
    await h.call("weeek_set_task_parent", { id: 80, parent: null });
    expect(setParent).toHaveBeenLastCalledWith({ taskId: 80, parentId: null });
    await expect(h.call("weeek_set_task_parent", { id: 80 })).rejects.toThrow();
  });
});
```

Append to `tests/helpers/tool-names.ts` `defaultToolNames` (before `.sort()`):

```ts
  "weeek_list_comments", "weeek_add_comment", "weeek_delete_comment",
  "weeek_add_assignees", "weeek_remove_assignees", "weeek_add_watchers", "weeek_remove_watchers",
  "weeek_add_task_to_project", "weeek_remove_task_from_project", "weeek_set_task_parent",
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tools/comments.test.ts tests/tools/task-links.test.ts tests/toolsets`
Expected: FAIL — modules not found; the register test's name list no longer matches.

- [ ] **Step 3: Implement**

Create `src/tools/comments.ts`:

```ts
import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, page, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

export function registerCommentTools({ server, client }: ToolContext): void {
  registerJsonTool(server, "weeek_list_comments", {
    description: "List the comments on a WEEEK task: id, author member id, markdown, reply parent, timestamps. Paged; `hasMore` says whether to call again with a larger offset.",
    inputSchema: { id: taskId, ...page },
  }, async (args) => client.tasks.listComments({ taskId: args.id, limit: args.limit, offset: args.offset }));

  registerJsonTool(server, "weeek_add_comment", {
    description: "Add a markdown comment to a WEEEK task as the token's owner. Pass `reply_to` (a comment id from weeek_list_comments) to answer in a thread.",
    inputSchema: { id: taskId, markdown: z.string().min(1), reply_to: z.number().int().optional() },
  }, async (args) => client.tasks.addComment({ taskId: args.id, markdown: args.markdown, parentId: args.reply_to }));

  registerJsonTool(server, "weeek_delete_comment", {
    description: "Permanently delete one comment from a WEEEK task. Irreversible; requires confirm:true.",
    inputSchema: { id: taskId, comment_id: z.number().int(), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    await client.tasks.removeComment({ taskId: args.id, commentId: args.comment_id });
    return { success: true };
  });
}
```

Create `src/tools/task-links.ts`:

```ts
import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { Resolver } from "../resolver.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, nameOrIdList, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

async function resolveMembers(resolver: Resolver, values: Array<string | number>): Promise<string[]> {
  return Promise.all(values.map((value) => resolver.resolve({ kind: "member", value })));
}

/** Tools that attach a task to people and places: assignees, watchers, projects, a parent task. */
export function registerTaskLinkTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_add_assignees", {
    description: "Assign one or more workspace members (by name or id) to a WEEEK task, keeping the existing assignees. Returns the task.",
    inputSchema: { id: taskId, assignees: nameOrIdList },
  }, async (args) => client.tasks.addAssignees({ taskId: args.id, memberIds: await resolveMembers(resolver, args.assignees) }));

  registerJsonTool(server, "weeek_remove_assignees", {
    description: "Unassign one or more members (by name or id) from a WEEEK task. Requires confirm:true. Returns the task.",
    inputSchema: { id: taskId, assignees: nameOrIdList, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeAssignees({ taskId: args.id, memberIds: await resolveMembers(resolver, args.assignees) }));

  registerJsonTool(server, "weeek_add_watchers", {
    description: "Add members (by name or id) as watchers of a WEEEK task, so they get its notifications. Returns the task; watchers are its `watchers` field.",
    inputSchema: { id: taskId, watchers: nameOrIdList },
  }, async (args) => client.tasks.addWatchers({ taskId: args.id, memberIds: await resolveMembers(resolver, args.watchers) }));

  registerJsonTool(server, "weeek_remove_watchers", {
    description: "Stop members (by name or id) watching a WEEEK task. Requires confirm:true. Returns the task.",
    inputSchema: { id: taskId, watchers: nameOrIdList, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeWatchers({ taskId: args.id, memberIds: await resolveMembers(resolver, args.watchers) }));

  registerJsonTool(server, "weeek_add_task_to_project", {
    description: "Show a WEEEK task in another project too (a task can live in several). Project and optional column by name or id. To move between boards of one project use weeek_move_task.",
    inputSchema: { id: taskId, project: nameOrId, column: nameOrId.optional() },
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const boardColumnId = args.column === undefined ? undefined : await resolver.resolve({ kind: "column", value: args.column, scope: { projectId } });
    return client.tasks.addLocation({ taskId: args.id, projectId, boardColumnId });
  });

  registerJsonTool(server, "weeek_remove_task_from_project", {
    description: "Remove a WEEEK task from one of its projects (by name or id); the task keeps its other projects. Requires confirm:true.",
    inputSchema: { id: taskId, project: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeLocation({ taskId: args.id, projectId: await resolver.resolve({ kind: "project", value: args.project }) }));

  registerJsonTool(server, "weeek_set_task_parent", {
    description: "Make a WEEEK task a subtask of `parent` (a task id), or pass parent:null to detach it and make it top-level again.",
    inputSchema: { id: taskId, parent: z.number().int().nullable() },
  }, async (args) => client.tasks.setParent({ taskId: args.id, parentId: args.parent }));
}
```

In `src/toolsets/register.ts` import the two registrars and change the table entry:

```ts
import { registerCoreTools } from "../tools/core.js";
import { registerTaskTools } from "../tools/tasks.js";
import { registerCommentTools } from "../tools/comments.js";
import { registerTaskLinkTools } from "../tools/task-links.js";
…
const registrars: Record<RealToolset, (ctx: ToolContext) => void> = {
  tasks: (ctx) => {
    registerTaskTools(ctx);
    registerCommentTools(ctx);
    registerTaskLinkTools(ctx);
  },
};
```

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm test`
Expected: PASS. `tests/server.test.ts` and `tests/toolsets/register.test.ts` now see 25 default tools; `tests/tool-quality.test.ts` passes because every `weeek_remove_*`/`weeek_delete_*` tool carries both `confirm` and `destructiveHint`.

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/tools/comments.ts src/tools/task-links.ts src/toolsets/register.ts tests/tools/comments.test.ts tests/tools/task-links.test.ts tests/helpers/tool-names.ts
git commit -m "feat(tools): comments, assignees, watchers, projects and parent on tasks"
```

---

### Task 10: The `time` toolset

**Files:**
- Create: `src/tools/time.ts`
- Modify: `src/toolsets/constants.ts` (`toolsetNames` gains `time`), `src/toolsets/register.ts` (registrar row)
- Modify: `tests/helpers/tool-names.ts`, `tests/toolsets/register.test.ts`, `tests/config.test.ts`
- Test: `tests/tools/time.test.ts`

**Interfaces:**
- Consumes: `TasksApi.{startTimer,stopTimer,addTimeEntry,updateTimeEntry,removeTimeEntry}` (Task 4), `TasksApi.get` (its `timeEntries`), `UserApi.me` (Task 6), `parseDay` (Task 8).
- Produces: `registerTimeTools(ctx)` — `weeek_set_timer`, `weeek_add_time_entry`, `weeek_update_time_entry`, `weeek_delete_time_entry`; toolset `time`; `timeToolNames`, `allToolNames` in the test helper.

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/time.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { registerTimeTools } from "../../src/tools/time.js";
import { toolHarness, reply, stubMembers } from "../helpers/tool-harness.js";

const [ilya, ann] = stubMembers;
const entry = { id: "te9", userId: ilya.id, date: "2026-07-20", duration: 45, isOvertime: false, comment: "" };
const client = () => ({
  workspace: { listMembers: async () => stubMembers },
  user: { me: async () => ({ id: ilya.id, name: "Ilya", email: "i@x.y", language: null, timeZone: null }) },
});

describe("time tools", () => {
  it("weeek_set_timer starts or stops the timer", async () => {
    const startTimer = vi.fn(async () => ({ success: true }));
    const stopTimer = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { startTimer, stopTimer } });
    await h.call("weeek_set_timer", { id: 78, running: true });
    expect(startTimer).toHaveBeenCalledWith(78);
    expect(stopTimer).not.toHaveBeenCalled();
    await h.call("weeek_set_timer", { id: 78, running: false });
    expect(stopTimer).toHaveBeenCalledWith(78);
  });

  it("weeek_add_time_entry defaults the member to the token's owner and parses the date", async () => {
    const addTimeEntry = vi.fn(async () => entry);
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { addTimeEntry } });
    expect(reply(await h.call("weeek_add_time_entry", { id: 78, date: "2026-07-20", minutes: 45 }))).toEqual(entry);
    expect(addTimeEntry).toHaveBeenCalledWith({ taskId: 78, entry: { userId: ilya.id, date: "2026-07-20", duration: 45, isOvertime: false } });
  });

  it("weeek_add_time_entry resolves a member by name and takes overtime", async () => {
    const addTimeEntry = vi.fn(async () => entry);
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { addTimeEntry } });
    await h.call("weeek_add_time_entry", { id: 78, date: "2026-07-20", minutes: 10, member: "ann", overtime: true });
    expect(addTimeEntry).toHaveBeenCalledWith({ taskId: 78, entry: { userId: ann.id, date: "2026-07-20", duration: 10, isOvertime: true } });
  });

  it("weeek_add_time_entry rejects more than a day of minutes before any call", async () => {
    const addTimeEntry = vi.fn();
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { addTimeEntry } });
    await expect(h.call("weeek_add_time_entry", { id: 78, date: "2026-07-20", minutes: 1441 })).rejects.toThrow();
    expect(addTimeEntry).not.toHaveBeenCalled();
  });

  it("weeek_update_time_entry merges the given fields over the current entry", async () => {
    const get = vi.fn(async () => ({ id: 78, timeEntries: [entry] }));
    const updateTimeEntry = vi.fn(async () => ({ ...entry, duration: 60 }));
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { get, updateTimeEntry } });
    expect(reply(await h.call("weeek_update_time_entry", { id: 78, entry_id: "te9", minutes: 60 }))).toEqual({ ...entry, duration: 60 });
    expect(updateTimeEntry).toHaveBeenCalledWith({ taskId: 78, timeEntryId: "te9", entry: { userId: ilya.id, date: "2026-07-20", duration: 60, isOvertime: false } });
  });

  it("weeek_update_time_entry refuses an entry that is not on the task", async () => {
    const updateTimeEntry = vi.fn();
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { get: async () => ({ id: 78, timeEntries: [] }), updateTimeEntry } });
    const res = await h.call("weeek_update_time_entry", { id: 78, entry_id: "nope", minutes: 5 });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/time entry nope is not on task 78/);
    expect(updateTimeEntry).not.toHaveBeenCalled();
  });

  it("weeek_delete_time_entry needs confirm:true", async () => {
    const removeTimeEntry = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { removeTimeEntry } });
    await expect(h.call("weeek_delete_time_entry", { id: 78, entry_id: "te9" })).rejects.toThrow();
    await h.call("weeek_delete_time_entry", { id: 78, entry_id: "te9", confirm: true });
    expect(removeTimeEntry).toHaveBeenCalledWith({ taskId: 78, timeEntryId: "te9" });
  });
});
```

Append to `tests/helpers/tool-names.ts`:

```ts
export const timeToolNames = ["weeek_set_timer", "weeek_add_time_entry", "weeek_update_time_entry", "weeek_delete_time_entry"].sort();
/** Every tool `WEEEK_TOOLSETS=all` registers. Later toolsets add their list here. */
export const allToolNames = [...defaultToolNames, ...timeToolNames].sort();
```

In `tests/toolsets/register.test.ts`:

- change the `expandToolsets` test so it derives from the constant instead of naming today's members:

```ts
  it("expandToolsets turns all into every real toolset and de-duplicates", () => {
    const real = toolsetNames.filter((name) => name !== "all");
    expect(expandToolsets(["all"])).toEqual(real);
    expect(expandToolsets(["all", "tasks"])).toEqual(real);
    expect(expandToolsets(["tasks", "tasks"])).toEqual(["tasks"]);
  });
```

- add, importing `allToolNames` and `timeToolNames` from the helper:

```ts
  it("registers every toolset's tools exactly once for all", async () => {
    const ctx = context();
    registerToolsets(ctx, ["all"]);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(allToolNames);
  });

  it("registers only core + time for the time toolset", async () => {
    const ctx = context();
    registerToolsets(ctx, ["time"]);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(["weeek_version", ...timeToolNames].sort());
  });
```

In `tests/config.test.ts` make the unknown-toolset assertion derive from the constant too: `expect(() => loadConfig({ WEEEK_TOOLSETS: "tasks,crm" })).toThrow(new RegExp(`WEEEK_TOOLSETS.*"crm".*${toolsetNames.join(", ")}`));`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tools/time.test.ts tests/toolsets tests/config.test.ts`
Expected: FAIL — `time.js` not found; `registerToolsets(ctx, ["time"])` throws because `registrars.time` is undefined.

- [ ] **Step 3: Implement**

Create `src/tools/time.ts`:

```ts
import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { TimeEntryFields } from "../client.js";
import { parseDay } from "../dates.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

const entryId = z.string().min(1);
const minutes = z.number().int().min(1).max(1440).describe("Minutes; the API caps one entry at a day.");

/** The `time` toolset: WEEEK's timer and manual time entries on tasks. */
export function registerTimeTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_set_timer", {
    description: "Start (running:true) or stop (running:false) WEEEK's time tracker on a task for the token's owner. Stopping records the elapsed time as an entry; weeek_get_task lists a task's `timeEntries`.",
    inputSchema: { id: taskId, running: z.boolean() },
  }, async (args) => (args.running ? client.tasks.startTimer(args.id) : client.tasks.stopTimer(args.id)));

  registerJsonTool(server, "weeek_add_time_entry", {
    description: "Record time spent on a WEEEK task: a natural-language `date`, the `minutes`, optionally the `member` it belongs to (name or id; default: the token's owner) and whether it is `overtime`.",
    inputSchema: { id: taskId, date: z.string(), minutes, member: nameOrId.optional(), overtime: z.boolean().default(false) },
  }, async (args) => {
    const userId = args.member === undefined ? (await client.user.me()).id : await resolver.resolve({ kind: "member", value: args.member });
    return client.tasks.addTimeEntry({ taskId: args.id, entry: { userId, date: parseDay(args.date), duration: args.minutes, isOvertime: args.overtime } });
  });

  registerJsonTool(server, "weeek_update_time_entry", {
    description: "Change a time entry on a WEEEK task (`entry_id` from the task's `timeEntries`): any of date, minutes, member, overtime. Fields you omit keep their current value.",
    inputSchema: { id: taskId, entry_id: entryId, date: z.string().optional(), minutes: minutes.optional(), member: nameOrId.optional(), overtime: z.boolean().optional() },
  }, async (args) => {
    // The API's PUT replaces all four fields, so the current entry is read and merged first.
    const task = await client.tasks.get(args.id);
    const current = task.timeEntries.find((candidate) => candidate.id === args.entry_id);
    if (!current) throw new Error(`time entry ${args.entry_id} is not on task ${args.id}`);
    const entry: TimeEntryFields = {
      userId: args.member === undefined ? current.userId : await resolver.resolve({ kind: "member", value: args.member }),
      date: args.date === undefined ? current.date : parseDay(args.date),
      duration: args.minutes ?? current.duration,
      isOvertime: args.overtime ?? current.isOvertime,
    };
    return client.tasks.updateTimeEntry({ taskId: args.id, timeEntryId: args.entry_id, entry });
  });

  registerJsonTool(server, "weeek_delete_time_entry", {
    description: "Delete a time entry from a WEEEK task. Irreversible; requires confirm:true.",
    inputSchema: { id: taskId, entry_id: entryId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeTimeEntry({ taskId: args.id, timeEntryId: args.entry_id }));
}
```

In `src/toolsets/constants.ts`: `export const toolsetNames = ["tasks", "time", "all"] as const;` and extend its comment: `// time: the timer and time entries, carved out so the default stays small.`

In `src/toolsets/register.ts`: import `registerTimeTools` and add the row `time: registerTimeTools,` — `Record<RealToolset, …>` fails the typecheck until it is there.

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/tools/time.ts src/toolsets tests/tools/time.test.ts tests/helpers/tool-names.ts tests/toolsets/register.test.ts tests/config.test.ts
git commit -m "feat(tools): time toolset — timer and time entries"
```

---

### Task 11: The `projects` toolset, part 1 — projects, boards, columns

**Files:**
- Create: `src/tools/projects.ts`
- Modify: `src/toolsets/constants.ts` (`projects`), `src/toolsets/register.ts`
- Modify: `tests/helpers/tool-names.ts`, `tests/toolsets/register.test.ts`
- Test: `tests/tools/projects.test.ts`

**Interfaces:**
- Consumes: `ProjectsApi`, `BoardsApi`, `ColumnsApi` (Task 5), `resolver.resolve` for `project`/`board`/`column`/`portfolio`, `resolver.forget` (Task 7).
- Produces: `registerProjectTools(ctx)` — `weeek_get_project`, `weeek_create_project`, `weeek_update_project`, `weeek_archive_project`, `weeek_delete_project`, `weeek_create_board`, `weeek_update_board`, `weeek_delete_board`, `weeek_move_board`, `weeek_create_column`, `weeek_update_column`, `weeek_delete_column`, `weeek_move_column`; toolset `projects` (Task 12 adds its second file); `projectToolNames`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/projects.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { registerProjectTools } from "../../src/tools/projects.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const marketing = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: null, team: [] };
const client = () => ({
  projects: { list: vi.fn(async () => [marketing]), get: vi.fn(async () => marketing) },
  boards: { list: vi.fn(async () => [{ id: 10, name: "Main", projectId: 1, isPrivate: false }, { id: 11, name: "Backlog", projectId: 1, isPrivate: false }]) },
  columns: { list: vi.fn(async () => [{ id: 100, name: "To do", boardId: 10 }, { id: 101, name: "Done", boardId: 10 }]) },
  portfolios: { list: vi.fn(async () => ({ portfolios: [{ id: 7, name: "Clients", parentId: null, isPrivate: false }], hasMore: false })) },
});

describe("project tools", () => {
  it("weeek_get_project resolves the name", async () => {
    const c = client();
    const h = toolHarness(registerProjectTools, c);
    expect(reply(await h.call("weeek_get_project", { project: "marketing" }))).toEqual(marketing);
    expect(c.projects.get).toHaveBeenCalledWith(1);
  });

  it("weeek_create_project resolves the portfolio, defaults private to false, and makes the new name resolvable at once", async () => {
    const c = client();
    const created = { ...marketing, id: 2, name: "Q4", portfolioId: 7 };
    const create = vi.fn(async () => created);
    c.projects.list.mockResolvedValueOnce([marketing]).mockResolvedValue([marketing, created]);
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, create } });
    await h.call("weeek_get_project", { project: "Marketing" }); // warms the cache
    expect(reply(await h.call("weeek_create_project", { name: "Q4", portfolio: "clients" }))).toEqual(created);
    expect(create).toHaveBeenCalledWith({ name: "Q4", isPrivate: false, description: undefined, portfolioId: 7 });
    await h.call("weeek_get_project", { project: "Q4" });
    expect(c.projects.get).toHaveBeenLastCalledWith(2);
    expect(c.projects.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_project merges over the current project so omitted fields survive", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...marketing, color: "#000" }));
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, update } });
    await h.call("weeek_update_project", { project: 1, color: "#000" });
    expect(update).toHaveBeenCalledWith({ projectId: 1, update: { name: "Marketing", isPrivate: false, color: "#000" } });
    await h.call("weeek_update_project", { project: 1, name: "Mkt", private: true });
    expect(update).toHaveBeenLastCalledWith({ projectId: 1, update: { name: "Mkt", isPrivate: true, color: "#fff" } });
  });

  it("weeek_archive_project needs confirm:true, defaults to archiving, and can restore", async () => {
    const c = client();
    const setArchived = vi.fn(async () => marketing);
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, setArchived } });
    await expect(h.call("weeek_archive_project", { project: 1 })).rejects.toThrow();
    await h.call("weeek_archive_project", { project: 1, confirm: true });
    expect(setArchived).toHaveBeenCalledWith({ projectId: 1, archived: true });
    await h.call("weeek_archive_project", { project: 1, archived: false, confirm: true });
    expect(setArchived).toHaveBeenLastCalledWith({ projectId: 1, archived: false });
  });

  it("weeek_delete_project needs confirm:true and forgets the project list", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, remove } });
    await h.call("weeek_get_project", { project: "Marketing" });
    await expect(h.call("weeek_delete_project", { project: "Marketing" })).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
    expect(reply(await h.call("weeek_delete_project", { project: "Marketing", confirm: true }))).toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith(1);
    await h.call("weeek_get_project", { project: "Marketing" }).catch(() => undefined);
    expect(c.projects.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_create_board resolves the project and forgets its boards", async () => {
    const c = client();
    const create = vi.fn(async () => ({ id: 12, name: "QA", projectId: 1, isPrivate: false }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, create } });
    await h.call("weeek_update_board", { board: "Main", project: "Marketing", name: "Main 2" }).catch(() => undefined); // warms boards:1
    await h.call("weeek_create_board", { project: "Marketing", name: "QA" });
    expect(create).toHaveBeenCalledWith({ name: "QA", projectId: 1 });
    await h.call("weeek_update_board", { board: "QA", project: "Marketing", name: "QA 2" }).catch(() => undefined);
    expect(c.boards.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_board takes a board id, or a name with its project", async () => {
    const c = client();
    const update = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, update } });
    await h.call("weeek_update_board", { board: 10, name: "Main 2" });
    expect(update).toHaveBeenCalledWith({ boardId: 10, name: "Main 2" });
    await h.call("weeek_update_board", { board: "backlog", project: "Marketing", name: "Later" });
    expect(update).toHaveBeenLastCalledWith({ boardId: 11, name: "Later" });
  });

  it("weeek_delete_board needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, remove } });
    await expect(h.call("weeek_delete_board", { board: 10 })).rejects.toThrow();
    await h.call("weeek_delete_board", { board: 10, confirm: true });
    expect(remove).toHaveBeenCalledWith(10);
  });

  it("weeek_move_board resolves `after` in the same project, and null means first", async () => {
    const c = client();
    const move = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, move } });
    await h.call("weeek_move_board", { board: "Backlog", project: "Marketing", after: "Main" });
    expect(move).toHaveBeenCalledWith({ boardId: 11, upperBoardId: 10 });
    await h.call("weeek_move_board", { board: 11, after: null });
    expect(move).toHaveBeenLastCalledWith({ boardId: 11, upperBoardId: null });
  });

  it("weeek_create_column resolves the board and forgets that board's columns", async () => {
    const c = client();
    const create = vi.fn(async () => ({ id: 102, name: "Review", boardId: 10 }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, create } });
    await h.call("weeek_update_column", { column: "Done", board: 10, name: "Shipped" }).catch(() => undefined); // warms board-columns:10
    await h.call("weeek_create_column", { board: 10, name: "Review" });
    expect(create).toHaveBeenCalledWith({ name: "Review", boardId: 10 });
    await h.call("weeek_update_column", { column: "Review", board: 10, name: "In review" }).catch(() => undefined);
    expect(c.columns.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_column resolves a column name inside its board, and a board name inside its project", async () => {
    const c = client();
    const update = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, update } });
    await h.call("weeek_update_column", { column: "done", board: "main", project: "Marketing", name: "Shipped" });
    expect(update).toHaveBeenCalledWith({ columnId: 101, name: "Shipped" });
  });

  it("weeek_update_column refuses a column name with no board or project", async () => {
    const c = client();
    const update = vi.fn();
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, update } });
    const res = await h.call("weeek_update_column", { column: "Done", name: "Shipped" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/needs boardId or projectId/);
    expect(update).not.toHaveBeenCalled();
  });

  it("weeek_delete_column needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, remove } });
    await expect(h.call("weeek_delete_column", { column: 101 })).rejects.toThrow();
    await h.call("weeek_delete_column", { column: 101, confirm: true });
    expect(remove).toHaveBeenCalledWith(101);
  });

  it("weeek_move_column resolves `after` on the same board, and null means first", async () => {
    const c = client();
    const move = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, move } });
    await h.call("weeek_move_column", { column: "To do", board: 10, after: "Done" });
    expect(move).toHaveBeenCalledWith({ columnId: 100, upperColumnId: 101 });
    await h.call("weeek_move_column", { column: 100, after: null });
    expect(move).toHaveBeenLastCalledWith({ columnId: 100, upperColumnId: null });
  });
});
```

Append to `tests/helpers/tool-names.ts` and fold the new list into `allToolNames`:

```ts
export const projectToolNames = [
  "weeek_get_project", "weeek_create_project", "weeek_update_project", "weeek_archive_project", "weeek_delete_project",
  "weeek_create_board", "weeek_update_board", "weeek_delete_board", "weeek_move_board",
  "weeek_create_column", "weeek_update_column", "weeek_delete_column", "weeek_move_column",
].sort();
export const allToolNames = [...defaultToolNames, ...timeToolNames, ...projectToolNames].sort();
```

(`projectToolNames` must be declared before `allToolNames`; Task 12 appends to it.)

Add to `tests/toolsets/register.test.ts`:

```ts
  it("registers only core + projects for the projects toolset", async () => {
    const ctx = context();
    registerToolsets(ctx, ["projects"]);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(["weeek_version", ...projectToolNames].sort());
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tools/projects.test.ts tests/toolsets`
Expected: FAIL — `projects.js` not found.

- [ ] **Step 3: Implement**

Create `src/tools/projects.ts`:

```ts
import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { Resolver } from "../resolver.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

interface BoardRef { board: string | number; project?: string | number; }
interface ColumnRef { column: string | number; board?: string | number; project?: string | number; }
interface ColumnScope { boardId?: number; projectId?: number; }

/** Ids for a board given by id, or by name inside its project. */
async function resolveBoard(resolver: Resolver, { board, project }: BoardRef): Promise<{ boardId: number; projectId?: number }> {
  const projectId = project === undefined ? undefined : await resolver.resolve({ kind: "project", value: project });
  const boardId = await resolver.resolve({ kind: "board", value: board, scope: { projectId } });
  return { boardId, projectId };
}

/** Ids for a column given by id, or by name inside its board or project. */
async function resolveColumn(resolver: Resolver, { column, board, project }: ColumnRef): Promise<{ columnId: number } & ColumnScope> {
  const projectId = project === undefined ? undefined : await resolver.resolve({ kind: "project", value: project });
  const boardId = board === undefined ? undefined : await resolver.resolve({ kind: "board", value: board, scope: { projectId } });
  const columnId = await resolver.resolve({ kind: "column", value: column, scope: { boardId, projectId } });
  return { columnId, boardId, projectId };
}

// A board write changes its project's board list and the project-wide column list; a column
// write changes its board's list and the project-wide one. Only the scopes known are dropped —
// a board passed as a bare id leaves the project-wide list to its 60 s TTL.
function forgetBoards(resolver: Resolver, projectId: number | undefined): void {
  if (projectId === undefined) return;
  resolver.forget({ kind: "board", scope: { projectId } });
  resolver.forget({ kind: "column", scope: { projectId } });
}
function forgetColumns(resolver: Resolver, { boardId, projectId }: ColumnScope): void {
  if (boardId !== undefined) resolver.forget({ kind: "column", scope: { boardId } });
  if (projectId !== undefined) resolver.forget({ kind: "column", scope: { projectId } });
}

export function registerProjectTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_get_project", {
    description: "Get one WEEEK project by name or id: description, privacy, status, portfolio and team member ids.",
    inputSchema: { project: nameOrId },
  }, async (args) => client.projects.get(await resolver.resolve({ kind: "project", value: args.project })));

  registerJsonTool(server, "weeek_create_project", {
    description: "Create a WEEEK project. Optional description, `private` (default false) and a `portfolio` (name or id) to file it under.",
    inputSchema: { name: z.string().min(1), description: z.string().optional(), private: z.boolean().default(false), portfolio: nameOrId.optional() },
  }, async (args) => {
    const portfolioId = args.portfolio === undefined ? undefined : await resolver.resolve({ kind: "portfolio", value: args.portfolio });
    const project = await client.projects.create({ name: args.name, isPrivate: args.private, description: args.description, portfolioId });
    resolver.forget({ kind: "project" });
    return project;
  });

  registerJsonTool(server, "weeek_update_project", {
    description: "Rename a WEEEK project (by name or id) or change its privacy or colour. Fields you omit keep their current value.",
    inputSchema: { project: nameOrId, name: z.string().min(1).optional(), private: z.boolean().optional(), color: z.string().min(1).optional() },
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    // PUT replaces name and isPrivate, so the current values are read first.
    const current = await client.projects.get(projectId);
    const project = await client.projects.update({
      projectId,
      update: { name: args.name ?? current.name, isPrivate: args.private ?? current.isPrivate, color: args.color ?? current.color ?? undefined },
    });
    resolver.forget({ kind: "project" });
    return project;
  });

  registerJsonTool(server, "weeek_archive_project", {
    description: "Archive a WEEEK project (archived:true, the default) or restore an archived one (archived:false). Requires confirm:true. Prefer this over weeek_delete_project when the tasks must survive.",
    inputSchema: { project: nameOrId, archived: z.boolean().default(true), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const project = await client.projects.setArchived({ projectId, archived: args.archived });
    resolver.forget({ kind: "project" });
    return project;
  });

  registerJsonTool(server, "weeek_delete_project", {
    description: "Permanently delete a WEEEK project and everything in it. Irreversible; requires confirm:true. To hide a project without losing it use weeek_archive_project.",
    inputSchema: { project: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const result = await client.projects.remove(projectId);
    resolver.forget({ kind: "project" });
    return result;
  });

  registerJsonTool(server, "weeek_create_board", {
    description: "Create a board in a WEEEK project (by name or id).",
    inputSchema: { project: nameOrId, name: z.string().min(1) },
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const board = await client.boards.create({ name: args.name, projectId });
    forgetBoards(resolver, projectId);
    return board;
  });

  registerJsonTool(server, "weeek_update_board", {
    description: "Rename a WEEEK board. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), name: z.string().min(1) },
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const result = await client.boards.update({ boardId, name: args.name });
    forgetBoards(resolver, projectId);
    return result;
  });

  registerJsonTool(server, "weeek_delete_board", {
    description: "Permanently delete a WEEEK board and its columns. Irreversible; requires confirm:true. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const result = await client.boards.remove(boardId);
    forgetBoards(resolver, projectId);
    forgetColumns(resolver, { boardId });
    return result;
  });

  registerJsonTool(server, "weeek_move_board", {
    description: "Reorder a WEEEK board: place it right after the board `after` (name or id in the same project), or first with after:null. Pass boards by id, or by name together with `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), after: nameOrId.nullable() },
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const upperBoardId = args.after === null ? null : await resolver.resolve({ kind: "board", value: args.after, scope: { projectId } });
    return client.boards.move({ boardId, upperBoardId });
  });

  registerJsonTool(server, "weeek_create_column", {
    description: "Create a column on a WEEEK board. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), name: z.string().min(1) },
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const column = await client.columns.create({ name: args.name, boardId });
    forgetColumns(resolver, { boardId, projectId });
    return column;
  });

  registerJsonTool(server, "weeek_update_column", {
    description: "Rename a WEEEK board column. Pass the column by id, or by name together with its `board` (and `project` when the board is a name).",
    inputSchema: { column: nameOrId, board: nameOrId.optional(), project: nameOrId.optional(), name: z.string().min(1) },
  }, async (args) => {
    const { columnId, boardId, projectId } = await resolveColumn(resolver, args);
    const result = await client.columns.update({ columnId, name: args.name });
    forgetColumns(resolver, { boardId, projectId });
    return result;
  });

  registerJsonTool(server, "weeek_delete_column", {
    description: "Permanently delete a WEEEK board column. Irreversible; requires confirm:true. Pass the column by id, or by name together with its `board` (and `project` when the board is a name).",
    inputSchema: { column: nameOrId, board: nameOrId.optional(), project: nameOrId.optional(), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { columnId, boardId, projectId } = await resolveColumn(resolver, args);
    const result = await client.columns.remove(columnId);
    forgetColumns(resolver, { boardId, projectId });
    return result;
  });

  registerJsonTool(server, "weeek_move_column", {
    description: "Reorder a WEEEK board column: place it right after the column `after` (name or id on the same board), or first with after:null. Pass columns by id, or by name together with `board` (and `project` when the board is a name).",
    inputSchema: { column: nameOrId, board: nameOrId.optional(), project: nameOrId.optional(), after: nameOrId.nullable() },
  }, async (args) => {
    const { columnId, boardId, projectId } = await resolveColumn(resolver, args);
    const upperColumnId = args.after === null ? null : await resolver.resolve({ kind: "column", value: args.after, scope: { boardId, projectId } });
    return client.columns.move({ columnId, upperColumnId });
  });
}
```

In `src/toolsets/constants.ts`: `export const toolsetNames = ["tasks", "time", "projects", "all"] as const;` and in the comment: `// projects: projects, boards, columns, portfolios, tags, workspace — the structure around tasks.`

In `src/toolsets/register.ts`: import `registerProjectTools` and add the row `projects: registerProjectTools,`.

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm test`
Expected: PASS. `tests/tool-quality.test.ts` passes: the five `weeek_delete_*`/`weeek_archive_*` tools carry `confirm` + `destructiveHint`.

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/tools/projects.ts src/toolsets tests/tools/projects.test.ts tests/helpers/tool-names.ts tests/toolsets/register.test.ts
git commit -m "feat(tools): projects toolset — project, board and column tools"
```

---

### Task 12: The `projects` toolset, part 2 — portfolios, tags, workspace, profile; the quality sweep

**Files:**
- Create: `src/tools/workspace.ts`
- Modify: `src/toolsets/register.ts` (the `projects` registrar composes two files)
- Modify: `tests/helpers/tool-names.ts`, `tests/tool-quality.test.ts`
- Test: `tests/tools/workspace.test.ts`

**Interfaces:**
- Consumes: `PortfoliosApi`, `TagsApi`, `WorkspaceApi.get`, `UserApi.me` (Task 6), `resolver.resolve` for `portfolio`/`tag`, `resolver.forget`.
- Produces: `registerWorkspaceTools(ctx)` — `weeek_list_portfolios`, `weeek_get_portfolio`, `weeek_create_portfolio`, `weeek_update_portfolio`, `weeek_delete_portfolio`, `weeek_list_tags`, `weeek_get_tag`, `weeek_create_tag`, `weeek_update_tag`, `weeek_delete_tag`, `weeek_get_workspace`, `weeek_get_profile`. `allToolNames` holds all 54.

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/workspace.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { registerWorkspaceTools } from "../../src/tools/workspace.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const clients = { id: 7, name: "Clients", parentId: null, isPrivate: false };
const urgent = { id: 5, title: "Urgent", color: "#f00" };
const client = () => ({
  portfolios: { list: vi.fn(async () => ({ portfolios: [clients], hasMore: false })), get: vi.fn(async () => clients) },
  tags: { list: vi.fn(async () => [urgent]), get: vi.fn(async () => urgent) },
  workspace: { get: vi.fn(async () => ({ id: 3, title: "Acme", description: null, isPersonal: false })) },
  user: { me: vi.fn(async () => ({ id: "u1", name: "Ilya", email: "i@x.y", language: "en", timeZone: null })) },
});

describe("workspace tools", () => {
  it("weeek_list_portfolios forwards search and paging, resolving the parent by name", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_list_portfolios", { search: "cli", parent: "Clients", limit: 10 }))).toEqual({ portfolios: [clients], hasMore: false });
    expect(c.portfolios.list).toHaveBeenLastCalledWith({ search: "cli", parentId: 7, limit: 10, offset: 0 });
  });

  it("weeek_get_portfolio resolves the name through the search", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_get_portfolio", { portfolio: "clients" }))).toEqual(clients);
    expect(c.portfolios.list).toHaveBeenCalledWith({ search: "clients", limit: 50 });
    expect(c.portfolios.get).toHaveBeenCalledWith(7);
  });

  it("weeek_create_portfolio resolves the parent and makes the new name resolvable at once", async () => {
    const c = client();
    const created = { id: 8, name: "Internal", parentId: 7, isPrivate: false };
    let known = [clients];
    const create = vi.fn(async () => { known = [clients, created]; return created; });
    c.portfolios.list.mockImplementation(async ({ search }: { search: string }) => ({ portfolios: known.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())), hasMore: false }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, create } });
    const before = await h.call("weeek_get_portfolio", { portfolio: "Internal" }); // caches an empty search result
    expect(before.isError).toBe(true);
    await h.call("weeek_create_portfolio", { name: "Internal", parent: "Clients" });
    expect(create).toHaveBeenCalledWith({ name: "Internal", parentId: 7 });
    await h.call("weeek_get_portfolio", { portfolio: "Internal" });
    expect(c.portfolios.get).toHaveBeenLastCalledWith(8);
  });

  it("weeek_update_portfolio renames by name or id", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...clients, name: "Customers" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, update } });
    await h.call("weeek_update_portfolio", { portfolio: 7, name: "Customers" });
    expect(update).toHaveBeenCalledWith({ portfolioId: 7, name: "Customers" });
  });

  it("weeek_delete_portfolio needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, remove } });
    await expect(h.call("weeek_delete_portfolio", { portfolio: 7 })).rejects.toThrow();
    await h.call("weeek_delete_portfolio", { portfolio: 7, confirm: true });
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("weeek_list_tags and weeek_get_tag read tags, the latter by title", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_list_tags", {}))).toEqual([urgent]);
    expect(reply(await h.call("weeek_get_tag", { tag: "urgent" }))).toEqual(urgent);
    expect(c.tags.get).toHaveBeenCalledWith(5);
  });

  it("weeek_create_tag makes the new title resolvable at once", async () => {
    const c = client();
    const created = { id: 6, title: "Later", color: "#00f" };
    const create = vi.fn(async () => created);
    c.tags.list.mockResolvedValueOnce([urgent]).mockResolvedValue([urgent, created]);
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, create } });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    await h.call("weeek_create_tag", { title: "Later" });
    expect(create).toHaveBeenCalledWith({ title: "Later" });
    await h.call("weeek_get_tag", { tag: "Later" });
    expect(c.tags.get).toHaveBeenLastCalledWith(6);
  });

  it("weeek_update_tag merges over the current tag so an omitted field survives", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...urgent, color: "#0f0" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, update } });
    await h.call("weeek_update_tag", { tag: "urgent", color: "#0f0" });
    expect(update).toHaveBeenCalledWith({ tagId: 5, update: { title: "Urgent", color: "#0f0" } });
  });

  it("weeek_delete_tag needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, remove } });
    await expect(h.call("weeek_delete_tag", { tag: 5 })).rejects.toThrow();
    await h.call("weeek_delete_tag", { tag: 5, confirm: true });
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("weeek_get_workspace and weeek_get_profile pass the client's answer through", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_get_workspace", {}))).toEqual({ id: 3, title: "Acme", description: null, isPersonal: false });
    expect(reply(await h.call("weeek_get_profile", {}))).toEqual({ id: "u1", name: "Ilya", email: "i@x.y", language: "en", timeZone: null });
  });
});
```

In `tests/helpers/tool-names.ts` extend `projectToolNames` with:

```ts
  "weeek_list_portfolios", "weeek_get_portfolio", "weeek_create_portfolio", "weeek_update_portfolio", "weeek_delete_portfolio",
  "weeek_list_tags", "weeek_get_tag", "weeek_create_tag", "weeek_update_tag", "weeek_delete_tag",
  "weeek_get_workspace", "weeek_get_profile",
```

In `tests/tool-quality.test.ts` replace the first test with an exact one (import `allToolNames` from `./helpers/tool-names.js`):

```ts
  it("registers exactly the documented surface for all", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(allToolNames);
  });
```

and add, so the name-based sweep cannot be fooled by a tool that lacks both markers:

```ts
  it("gates every tool whose name says it detaches or deletes, by name list", () => {
    const expected = allToolNames.filter((n) => destructiveName.test(n));
    const gated = tools.filter((t) => isDestructive(t) && requiresConfirm(t)).map((t) => t.name).sort();
    expect(gated).toEqual(expected);
  });
```

(`weeek_archive_project` is the one destructive tool `destructiveName` already matches via `archive`; this test pins that every tool with `destructiveHint` is exactly the set the name rule predicts — 12 tools, 11 of them new.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tools/workspace.test.ts tests/tool-quality.test.ts tests/toolsets`
Expected: FAIL — `workspace.js` not found; `all` lists 42 tools, not 54.

- [ ] **Step 3: Implement**

Create `src/tools/workspace.ts`:

```ts
import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, page } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

/** Workspace-level things: portfolios, tags, the workspace itself, the token's owner. */
export function registerWorkspaceTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_portfolios", {
    description: "List WEEEK portfolios (folders of projects), optionally narrowed by `search` text or a `parent` portfolio (name or id). Paged; `hasMore` says whether to call again with a larger offset.",
    inputSchema: { search: z.string().min(1).optional(), parent: nameOrId.optional(), ...page },
  }, async (args) => {
    const parentId = args.parent === undefined ? undefined : await resolver.resolve({ kind: "portfolio", value: args.parent });
    return client.portfolios.list({ search: args.search, parentId, limit: args.limit, offset: args.offset });
  });

  registerJsonTool(server, "weeek_get_portfolio", {
    description: "Get one WEEEK portfolio by name or id: parent portfolio and privacy.",
    inputSchema: { portfolio: nameOrId },
  }, async (args) => client.portfolios.get(await resolver.resolve({ kind: "portfolio", value: args.portfolio })));

  registerJsonTool(server, "weeek_create_portfolio", {
    description: "Create a WEEEK portfolio, optionally inside a `parent` portfolio (name or id).",
    inputSchema: { name: z.string().min(1), parent: nameOrId.optional() },
  }, async (args) => {
    const parentId = args.parent === undefined ? undefined : await resolver.resolve({ kind: "portfolio", value: args.parent });
    const portfolio = await client.portfolios.create({ name: args.name, parentId });
    resolver.forget({ kind: "portfolio" });
    return portfolio;
  });

  registerJsonTool(server, "weeek_update_portfolio", {
    description: "Rename a WEEEK portfolio (by name or id).",
    inputSchema: { portfolio: nameOrId, name: z.string().min(1) },
  }, async (args) => {
    const portfolioId = await resolver.resolve({ kind: "portfolio", value: args.portfolio });
    const portfolio = await client.portfolios.update({ portfolioId, name: args.name });
    resolver.forget({ kind: "portfolio" });
    return portfolio;
  });

  registerJsonTool(server, "weeek_delete_portfolio", {
    description: "Permanently delete a WEEEK portfolio (by name or id). Irreversible; requires confirm:true.",
    inputSchema: { portfolio: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const portfolioId = await resolver.resolve({ kind: "portfolio", value: args.portfolio });
    const result = await client.portfolios.remove(portfolioId);
    resolver.forget({ kind: "portfolio" });
    return result;
  });

  registerJsonTool(server, "weeek_list_tags", {
    description: "List the workspace's WEEEK tags: id, title, colour. weeek_update_task takes tags by these titles.",
    inputSchema: {},
  }, async () => client.tags.list());

  registerJsonTool(server, "weeek_get_tag", {
    description: "Get one WEEEK tag by title or id.",
    inputSchema: { tag: nameOrId },
  }, async (args) => client.tags.get(await resolver.resolve({ kind: "tag", value: args.tag })));

  registerJsonTool(server, "weeek_create_tag", {
    description: "Create a WEEEK workspace tag with the given title; WEEEK assigns its colour, which weeek_update_tag can change.",
    inputSchema: { title: z.string().min(1) },
  }, async (args) => {
    const tag = await client.tags.create({ title: args.title });
    resolver.forget({ kind: "tag" });
    return tag;
  });

  registerJsonTool(server, "weeek_update_tag", {
    description: "Change a WEEEK tag's title or colour (tag by title or id). Fields you omit keep their current value.",
    inputSchema: { tag: nameOrId, title: z.string().min(1).optional(), color: z.string().min(1).optional() },
  }, async (args) => {
    const tagId = await resolver.resolve({ kind: "tag", value: args.tag });
    // PUT replaces both fields, so the current tag is read first.
    const current = await client.tags.get(tagId);
    const tag = await client.tags.update({ tagId, update: { title: args.title ?? current.title, color: args.color ?? current.color } });
    resolver.forget({ kind: "tag" });
    return tag;
  });

  registerJsonTool(server, "weeek_delete_tag", {
    description: "Permanently delete a WEEEK tag (by title or id) from the workspace and every task that carries it. Irreversible; requires confirm:true.",
    inputSchema: { tag: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const tagId = await resolver.resolve({ kind: "tag", value: args.tag });
    const result = await client.tags.remove(tagId);
    resolver.forget({ kind: "tag" });
    return result;
  });

  registerJsonTool(server, "weeek_get_workspace", {
    description: "Get the WEEEK workspace the token belongs to: id, title, description, whether it is a personal workspace.",
    inputSchema: {},
  }, async () => client.workspace.get());

  registerJsonTool(server, "weeek_get_profile", {
    description: "Get the profile of the token's owner: member id, name, email, language, time zone. The id is what a task's `assignees` and `watchers` hold for you.",
    inputSchema: {},
  }, async () => client.user.me());
}
```

In `src/toolsets/register.ts` import `registerWorkspaceTools` and change the row:

```ts
  projects: (ctx) => {
    registerProjectTools(ctx);
    registerWorkspaceTools(ctx);
  },
```

- [ ] **Step 4: Run the gate, then measure the surface**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

Then record the cost of the grown default, for the README and for the Glama check in Task 13:

```bash
node -e '
import("./dist/server.js").then(async ({ buildServer }) => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  for (const toolsets of [["tasks"], ["all"]]) {
    const server = buildServer({ baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024, toolsets });
    const [s, c] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "measure", version: "0" });
    await client.connect(c);
    const { tools } = await client.listTools();
    console.log(toolsets.join(","), tools.length, "tools,", JSON.stringify(tools).length, "bytes");
    await client.close(); await server.close();
  }
});'
```

Expected: two lines, `tasks 25 tools, … bytes` and `all 54 tools, … bytes`. Paste both into the Task 13 README step.

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/tools/workspace.ts src/toolsets/register.ts tests/tools/workspace.test.ts tests/helpers/tool-names.ts tests/tool-quality.test.ts
git commit -m "feat(tools): portfolios, tags, workspace and profile in the projects toolset"
```

---

### Task 13: Docs, manifests, release 0.6.0, live smoke

**Files:**
- Modify: `README.md`, `docs/FOLLOWUPS.md`, `manifest.json`, `server.json`, `package.json`, `package-lock.json`

- [ ] **Step 1: README**

Replace the `## Toolsets` section's table and the paragraph after it with:

```markdown
| Toolset | Tools | Default |
|---|---|---|
| `tasks` | `weeek_list_projects`, `weeek_list_boards`, `weeek_list_columns`, `weeek_list_tasks`, `weeek_get_task`, `weeek_list_members`, `weeek_get_attachment`, `weeek_create_task`, `weeek_create_tasks`, `weeek_update_task`, `weeek_move_task`, `weeek_complete_task`, `weeek_attach_file`, `weeek_delete_task`, `weeek_list_comments`, `weeek_add_comment`, `weeek_delete_comment`, `weeek_add_assignees`, `weeek_remove_assignees`, `weeek_add_watchers`, `weeek_remove_watchers`, `weeek_add_task_to_project`, `weeek_remove_task_from_project`, `weeek_set_task_parent` | **yes** |
| `time` | `weeek_set_timer`, `weeek_add_time_entry`, `weeek_update_time_entry`, `weeek_delete_time_entry` | |
| `projects` | `weeek_get_project`, `weeek_create_project`, `weeek_update_project`, `weeek_archive_project`, `weeek_delete_project`, `weeek_create_board`, `weeek_update_board`, `weeek_delete_board`, `weeek_move_board`, `weeek_create_column`, `weeek_update_column`, `weeek_delete_column`, `weeek_move_column`, `weeek_list_portfolios`, `weeek_get_portfolio`, `weeek_create_portfolio`, `weeek_update_portfolio`, `weeek_delete_portfolio`, `weeek_list_tags`, `weeek_get_tag`, `weeek_create_tag`, `weeek_update_tag`, `weeek_delete_tag`, `weeek_get_workspace`, `weeek_get_profile` | |
| `all` | every toolset | |

`weeek_version` is always available. The default is the task surface: <N from Task 12> bytes of
tool schemas per request; `all` is <N from Task 12> bytes. `custom-fields` (0.7.0) and `crm`
(1.0.0) arrive in the next releases; an unknown name is rejected at startup with the list of
valid ones.

```bash
WEEEK_TOOLSETS=tasks,time npx -y weeek-mcp-smart   # add time tracking
WEEEK_TOOLSETS=all npx -y weeek-mcp-smart          # everything
```
```

In `## Safety` add a fourth bullet:

```markdown
- **Every tool that deletes, archives or detaches** — a project, board, column, tag, portfolio, comment or time entry; an assignee or watcher; a task's membership of a project — requires `confirm: true` and is marked destructive in its annotations, so a client can ask before running it.
```

In the opening example, after the `weeek_create_task` block, add one line: ``Then `weeek_add_comment`, `weeek_add_assignees`, `weeek_set_task_parent` — all by name, all one call.``

- [ ] **Step 2: Manifests**

`manifest.json`: add to `user_config`:

```json
    "weeek_toolsets": {
      "type": "string",
      "title": "Toolsets",
      "description": "Comma-separated tool groups to expose: tasks (default), time, projects — or all",
      "required": false,
      "default": "tasks"
    }
```

and to `server.mcp_config.env`: `"WEEEK_TOOLSETS": "${user_config.weeek_toolsets}"`.

`server.json`: change the `WEEEK_TOOLSETS` description to `"Comma-separated tool groups to expose: tasks (default), time, projects — or \"all\""`.

- [ ] **Step 3: FOLLOWUPS**

- Item 14: replace the trailing "Still open: …" sentence with ` Closed in Phase 2: `weeek_list_boards` and `weeek_list_columns` are in the default toolset.`
- Item 20: strike the `manifest.json` `user_config` bullet (` — RESOLVED (Phase 2, Task 13)`).
- Add item 21:

```markdown
21. **Phase 2 leaves to verify live, and the spec/code gaps it found** — the Phase 2 smoke (plan Task 13) records each outcome here: (a) FOLLOWUPS #15/#16 — do `POST /tm/tasks/{id}/assignees` and the comments endpoints now work? (b) task dates: the code sends `dayFrom` on create and update while the spec says `day` and `dueDate` — which one the API honours decides whether `buildNewTask`/`buildTaskPatch` switch; (c) `Project.status` — which of 1/2 an archived project carries; (d) the `tags` query filter of `GET /tm/tasks` is not exposed because the array encoding (`tags[]=` vs repeated `tags=`) is undocumented; (e) FOLLOWUPS #18 upload shape; (f) a tag's `color` format.
```

- [ ] **Step 4: Bump the version and run the gate**

```bash
npm version 0.6.0 --no-git-tag-version
npm run typecheck && npm test && npm run build
git status --short
```

Expected: `package.json` and `package-lock.json` at 0.6.0; gate green.

- [ ] **Step 5: Commit, push, open the PR (each after go-ahead)**

```bash
git add README.md docs/FOLLOWUPS.md manifest.json server.json package.json package-lock.json
git commit -m "chore: release 0.6.0"
git push -u origin feat/phase-2-task-manager
gh pr create --base main --title "feat: task manager — comments, assignees, time, projects, boards, columns, portfolios, tags (phase 2)" --body-file - <<'EOF'
Phase 2 of the full-API-coverage design (docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md).

- 41 task-manager operations registered and typed; `notYetImplemented` Phase 2 block deleted (101 remain for custom fields and CRM)
- `tasks` toolset (default) grows from 12 to 24 tools: comments, assignees, watchers, task↔project links, parent, plus `weeek_list_boards` / `weeek_list_columns`; `weeek_list_tasks`, `weeek_create_task` and `weeek_update_task` gain filters and fields, additively
- New toolsets: `time` (timer, time entries) and `projects` (projects, boards, columns, portfolios, tags, workspace, profile)
- Resolver: `tag` and `portfolio` kinds, server-side search strategy, `forget()` so a thing created by one call resolves by name in the next
- Every delete / archive / detach tool requires `confirm:true` and carries `destructiveHint`; `tests/tool-quality.test.ts` pins the full 54-tool surface

Existing tool names and parameters are unchanged. `WEEEK_TOOLSETS` unset still registers only `tasks`.
EOF
```

- [ ] **Step 6: After the PR is merged — tag, which publishes (after go-ahead)**

```bash
git checkout main && git pull
git tag v0.6.0 && git push origin v0.6.0
```

CI (`release.yml`) verifies the tag equals `package.json`'s version, runs the tests, publishes to npm and the MCP registry, and attaches the `.mcpb` to a GitHub Release. Watch it at https://github.com/IlyaIvanchikov/weeek-mcp/actions. If "Verify tag matches package.json version" fails, the bump commit is missing from `main`. Then check Glama's tool-count score for the server; if it dropped below 4/5, the spec's lever is to move more of the default into `time`/`projects` — a table edit in `src/toolsets/register.ts` and the README, decided then.

- [ ] **Step 7: Live smoke (user-run, token stays in the server)**

With the published 0.6.0 configured as the `weeek` MCP server and `WEEEK_TOOLSETS=all` (restart the client after changing it). Record every unexpected outcome in FOLLOWUPS #21.

1. 🔵 `weeek_version` → `0.6.0`; the client lists 54 tools.
2. 🟢 `weeek_create_project { name: "phase-2 smoke" }` → project; immediately `weeek_create_task { title: "smoke", project: "phase-2 smoke" }` → resolves by name without a 60 s wait (Review Focus 5). Note the task id as T.
3. 🟢 `weeek_add_comment { id: T, markdown: "hello" }` → comment; `weeek_list_comments { id: T }` shows it; `weeek_delete_comment { …, confirm: true }`. Settles FOLLOWUPS #16.
4. 🟢 `weeek_add_assignees { id: T, assignees: ["<a member name>"] }` → the task's `assignees` includes them on a fresh `weeek_get_task`; `weeek_remove_assignees { …, confirm: true }` empties it again. Settles FOLLOWUPS #15.
5. 🟢 `weeek_add_watchers` / `weeek_remove_watchers` likewise; the task's `watchers` field reflects it.
6. 🟢 `weeek_create_task { title: "child", project: "phase-2 smoke", parent: T }` → `parentId` = T; `weeek_set_task_parent { id: <child>, parent: null }` detaches; `weeek_get_task { id: T }` shows `subTasks` before and after.
7. 🟢 `weeek_add_task_to_project { id: T, project: "<another project>" }` → `locations` has two entries; `weeek_remove_task_from_project { …, confirm: true }` → one.
8. 🟢 `weeek_update_task { id: T, due: "next friday", start: "tomorrow", priority: "high", type: "call", duration: 30 }` → re-read: which of `dueDate`/`startDate`/`priority`/`type`/`duration` changed. If `dueDate` did not, `dayFrom` is dead and both builders switch to `dueDate` / `day` (FOLLOWUPS #21b).
9. 🟢 `weeek_create_tag { title: "smoke-tag" }` → note its `color` format; `weeek_update_task { id: T, tags: ["smoke-tag"] }` → `tags` has its id; `weeek_update_tag { tag: "smoke-tag", color: "<same format>" }`; `weeek_delete_tag { …, confirm: true }`.
10. 🟢 `weeek_set_timer { id: T, running: true }`, wait a minute, `running: false` → `weeek_get_task` shows a time entry; `weeek_add_time_entry { id: T, date: "today", minutes: 15 }`; `weeek_update_time_entry { id: T, entry_id: <id>, minutes: 20 }`; `weeek_delete_time_entry { …, confirm: true }`.
11. 🟢 `weeek_create_board { project: "phase-2 smoke", name: "B" }`, `weeek_create_column { board: "B", project: "phase-2 smoke", name: "C" }`, `weeek_update_column`, `weeek_move_column { …, after: null }`, `weeek_delete_column { …, confirm: true }`, `weeek_move_board { …, after: null }`, `weeek_delete_board { …, confirm: true }`.
12. 🟢 `weeek_create_portfolio { name: "smoke-folder" }`, `weeek_list_portfolios { search: "smoke" }`, `weeek_update_project { project: "phase-2 smoke", color: "<a colour>" }`, `weeek_delete_portfolio { …, confirm: true }`.
13. 🔵 `weeek_archive_project { project: "phase-2 smoke", confirm: true }` → note `status`; `archived: false` → note `status` again (FOLLOWUPS #21c). `weeek_get_workspace`, `weeek_get_profile` → sane values.
14. 🔴 `weeek_delete_task { id: T, confirm: true }`, then `weeek_delete_project { project: "phase-2 smoke", confirm: true }`.
15. 🔴 Restart with `WEEEK_TOOLSETS=bogus` → the server exits with `invalid config: WEEEK_TOOLSETS: unknown toolset "bogus"; valid values: tasks, time, projects, all`.

---

## Self-review (done while writing; kept so a reader can audit it)

- **Spec coverage, Phase 2 row of §6:** the remaining 15 task operations (T2 registry; T3 relations; T4 time; T9/T10 tools) · projects, boards, columns (T5, T11) · portfolios, tags, workspace, user (T6, T12) · "re-verify FOLLOWUPS #15/#16 live" (T13 smoke steps 3–4). §3.3 toolsets table: `projects` holds projects, boards, columns, portfolios, tags, workspace as listed; the spec's single `tasks` row is split into `tasks` + `time` per its own carve-out clause. §3.4 naming: archive/un-archive and start/stop are one tool each; add/remove pairs are separate; 12 destructive tools gated (11 new). §4: `tag` (list) and `portfolio` (search) kinds; cache invalidation (§4.1 step 5) via `forget` in every write tool of T11/T12 — no task write invalidates anything because no name list depends on tasks. §5.2: one test per client method (T3–T6); resolver per kind (T7); builders (`buildNewTask`, `buildTaskPatch`, `buildTaskQuery`) tested through the tool harness (T8); tool tests per tool (T9–T12); toolsets/config (T10); tool quality exact surface (T12). Not in Phase 2 by the spec: custom fields (`customFields` on tasks and projects is dropped by the normalisers), CRM, the `task` search kind (tools keep numeric task ids as every existing tool does).
- **Placeholder scan:** the only non-literal values are the two byte counts in the README step, which Task 12 step 4 produces and names as the source.
- **Type consistency:** `TaskMembersOptions { taskId, memberIds }` is what T9 calls; `AddLocationOptions.boardColumnId?: number` and T9 passes `undefined` when no column is given; `TimeEntryFields` is what T10 builds and T4 sends; `ProjectUpdate { name, isPrivate, color? }` is what T11 merges; `TagUpdate { title, color }` what T12 merges; `PortfolioQuery` is a type alias so T12's object literal is assignable; `resolver.forget({ kind, scope? })` matches `ForgetOptions`; `registerJsonTool(server, name, config, run)` is used with the same four positions everywhere; `toolsetNames` grows in T10 then T11 and the tests derive from it from T10 on; `defaultToolNames` grows in T8 (15) and T9 (25), `allToolNames` is assembled in T10 and extended in T11/T12.
- **Review Focus → tests:** (1) T10 `weeek_update_time_entry merges…`, T11 `weeek_update_project merges…`, T12 `weeek_update_tag merges…`; (2) T3 `setParent sends … explicit null`, T9 `weeek_set_task_parent sends … null`; (3) one `needs confirm:true` test per destructive tool in T9–T12 plus T12's exact gated-set test; (4) T8 `weeek_list_columns refuses a board name without a project`, T11 `weeek_update_column refuses…`, T7 `names both scopes…`; (5) T7 `forget makes the next resolve reload…`, T11 `weeek_create_project … resolvable at once`, T12 `weeek_create_portfolio…`/`weeek_create_tag…`; (6) T8 `forwards the Phase 2 filters` (`all: 1`).
