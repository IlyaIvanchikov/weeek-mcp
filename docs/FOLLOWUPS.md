# Follow-ups (deferred from the v0.1 whole-branch review)

None of these block v0.1; the create-by-name path is verified sound and token handling has no leak. Ordered roughly by value.

1. **`config.ts` empty-string timeout** — `WEEEK_TIMEOUT_MS=""` coerces to `0` and fails `.positive()` instead of using the `30000` default. Add an empty-string→undefined pre-transform. (Fails loudly at startup; low blast radius — README never asks users to set it.)
2. **`NameCache` request-coalescing** — two concurrent cold `get()` calls for the same key both run `load()`. Cache the in-flight promise. Wasteful, not incorrect.
3. **`cache.ts` `get<T>` unchecked cast** — safe today because each key prefix (`projects`/`members`/`columns:`/`board-columns:`) maps to one type; nothing enforces it. Consider a typed cache-key registry.
4. **`writes.ts` bulk vs `reply.ts` duplicate `ResolutionError`→candidates logic** — two implementations of the same rule (`writes.ts:59-63` and `reply.ts:5-12`). Extract one helper so a future tweak (e.g. cap candidate count) touches one place.
5. **`client.moveTask(id, boardId, boardColumnId)`** — three same-typed positional `number` args (the swap-is-silently-type-safe pattern the repo's own rules flag). Bundle into an options object.
6. **`moveTask` is two non-atomic POSTs** (`/board` then `/board-column`). If the second fails, the task is on the new board with its old column, surfaced only as a generic error. Likely a WEEEK API limitation; track, don't block.
7. **Version string duplicated 3×** — `package.json:3`, `manifest.json:4`, `server.ts:13`. Derive `server.ts`/manifest from `package.json` (single source of truth).
8. **`index.ts` `(err as Error).message`** assumes every rejection is an `Error`. Safe today (`loadConfig` always throws `Error`), unenforced.
9. **`tests/server.test.ts`** only asserts `buildServer()` doesn't throw — add an assertion that a specific tool (e.g. `weeek_create_task`) is actually registered, so a registration regression is caught.
10. **No `TZ=UTC` pinned** (test script / vitest config; no CI workflow exists yet). All date tests pass an explicit `now`, so no live flake, but a future test that omits it could flake by timezone.
11. **`scripts/pack-mcpb.sh` dead first branch** — the `src/index.js` esbuild attempt always fails (source is `.ts`) before falling through to `src/index.ts`. Drop it.
12. **`@anthropic-ai/mcpb` unpinned** — `npx @anthropic-ai/mcpb pack` resolves whatever `npx` fetches. Pin a version for reproducible builds.
13. **UUID-shaped display name** — `resolveAssignee` passes through any canonical-UUID string as an id without verifying a member exists. Accepted trade-off of the strict-UUID-passthrough design; note only.
14. ~~**Task shape omits `assignee` and `board`**~~ — RESOLVED: `WeeekTask`/`toTask` now surface `assignees: string[]` and `boardId`, so `get_task`/`create_task` show who a task is assigned to and which board it's on. Still open: a `list_boards`/`list_columns` read tool so `move_task` targets are discoverable.
15. **Reassigning an existing task is not possible via the public API** — verified live: `PUT /tm/tasks/{id}` with `assignees`, `userId`, or an empty array all return `success:true` but never change the persisted assignees (fresh GET is unchanged); `POST /tm/tasks/{id}/assignees` 200s but no-ops. Assignment only takes effect at **create** time (`userId` → `assignees:[userId]`, confirmed for arbitrary members). So there is no `assign`/reassign tool — set the assignee on create.
16. **Task comments are not exposed by the public API** — probed exhaustively (GET+POST on `/tm/tasks/{id}/comments`, `/tm/task-comments`, `/tm/comments`, `?expand=comments`, and more): all 404 or return the plain task with no comments field. A "read comments with the task" feature is impossible until WEEEK ships a comments endpoint.
