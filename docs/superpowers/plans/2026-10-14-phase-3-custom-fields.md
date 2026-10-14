# Phase 3 — Custom fields: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every custom-field operation of the WEEEK public API callable — the 38 admin operations (fields and their options, in the global, project, board and funnel scopes) as typed client methods and as ten MCP tools in a new `custom-fields` toolset — and let the default `tasks` toolset read and set custom-field values on tasks by field name, released as 0.7.0.

**Architecture:** Each operation is one registry entry (`src/operations.ts`), one scope-dispatching method on `CustomFieldsApi` (`src/api/custom-fields.ts`), and one tool in `src/tools/custom-fields.ts` that takes `scope` plus the owner's name; the contract test's Phase 3 block shrinks to zero. The resolver learns two kinds — `funnel` (an *opaque* id: the live API returns `OLY24hy2mC7n9D9l`-style strings, not UUIDs) and `customField` (scoped by a `FieldScope`) — and gains `list` and `find`, which return the cached entries themselves, because every field tool needs the field's options and settings, not only its id. Tasks carry `customFields` values; `weeek_create_task` and `weeek_update_task` take `fields` by name. `GET /crm/funnels` is pulled forward from Phase 4 because funnel names must resolve.

**Tech Stack:** TypeScript 5 (NodeNext ESM, `.js` import suffixes), Node ≥ 18, `@modelcontextprotocol/sdk` ^1.0 (1.29.0 installed), `zod` ^3.23 (3.25), `chrono-node` ^2.10, `vitest` 2 (2.1.9), GitHub Actions (tag-triggered publish).

**Spec:** `docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md` — §3.3 (toolsets), §3.4 (custom fields: one method per operation, a `scope` enum narrowed at the tool), §4 (name resolution; the custom-field and option rows; the "opaque id" fallback), §5 (testing), §6 Phase 3 row.

## Facts found while planning (2026-10-14), which this plan rests on

- **The user's workspace has no custom fields yet**, so nothing about live shapes could be read; every assumption below is listed for the smoke in Task 9.
- **A funnel id is not a UUID.** `GET /crm/funnels` returned `{ "id": "OLY24hy2mC7n9D9l", "name": "…" }`. The spec declares funnel, status and deal ids as bare strings; the design's fallback (§4, "opaque") applies: an opaque id is only ever recognised against the loaded collection. Phase 4 inherits this for statuses and deals.
- **No endpoint lists a board's fields.** `Project` and `Funnel` carry `customFields: CustomField[]`; `Board` does not, and there is no `GET /tm/boards/{id}`. A task carries `customFields: CustomFieldValue[]` — each with `id`, `name`, `type`, `options` — for every field that applies to it. So the board scope is read **off the board's tasks**: the first task of `GET /tm/tasks?boardId=…&perPage=1&all=1`, minus the global and the project fields. An empty board lists no fields; the tool description says so.
- **Spec inconsistencies to carry, not fix:** the option colour enum has 12 names on `CustomFieldOption` and 13 on every request body (`turquoise`, `yellow` vs `dark_green`) — the request-body list is what we send; `CustomFieldValue.type` lacks `number` while `CustomField.type` has it — we accept all ten; every `move` body declares both `after` and `before` required while the description says they are exclusive — we send exactly one.
- **`GET /tm/custom-fields` answers `{ success, data: CustomField[] }`**; create/update answer `{ success, customField }`; option create/update answer `{ success, option }`; everything else `{ success }`.
- **Task values on the wire** (spec `CustomFieldValues`): text/link → string, number → number, boolean → boolean, datetime → ISO 8601 string, select → option id, multiselect → option ids, member/approval → user ids, contact → contact id.
- **0.6.0 boots from npm** (`npx -y weeek-mcp-smart@0.6.0`: 25 tools, 14 795 bytes); the MCP connection failure seen in this session was environmental.
- **Typechecking `tests/` today reports 18 errors** in five files, all from untyped `vi.fn()` fetch stubs (`mock.calls[0]` is a `[]` tuple) and two fixtures whose `null` fields were inferred as literal `null`.

## Global Constraints

- **Never commit without the user's explicit go-ahead.** Each task ends with a commit step; stop before it, show `git status --short` and the message, and wait. A blanket "approve all" from the user covers branch commits only — never a push, a PR, a tag or a publish.
- **Never `npm publish` by hand.** Pushing a `v*` tag triggers CI, which verifies `package.json` version == tag, publishes to npm and the MCP registry, and attaches the `.mcpb`.
- **Prerequisite:** 0.6.0 is tagged and published (done 2026-10-14). This plan branches from `main`: `git checkout main && git pull && git checkout -b feat/phase-3-custom-fields`.
- Node ≥ 18 (`engines`), ESM only, every relative import ends in `.js`. No new runtime dependencies.
- Conventional Commits (commitlint): `type(scope): imperative subject`, lowercase, no trailing period.
- English-only code and comments. Match the existing comment density (a sentence of *why* at non-obvious spots, nothing else).
- Tests live in `tests/` and mirror `src/` one-to-one; fixtures are synthetic JSON shaped by `spec/weeek-openapi.json`'s component schemas; a value used both to build and to assert is declared once.
- No token in CI, in tests, or in any log line. The server must still boot and list tools without `WEEEK_API_TOKEN`.
- **Existing tools change additively only.** The 54 tool names of 0.6.0 stay; every parameter they have today keeps its name, type and meaning; new parameters are optional. `weeek_update_task`'s `tags` may become empty-allowed (it was `min(1)`), which widens, never narrows.
- **Tool naming and safety (spec §3.4):** `weeek_<verb>_<noun>`; every tool that deletes requires `confirm: true` (`z.literal(true)`) and carries `destructiveHint: true`; `tests/tool-quality.test.ts` enforces the pair for every `weeek_delete_*`, `weeek_archive_*`, `weeek_detach_*`, `weeek_remove_*` name. `weeek_transfer_custom_field` and the two `move` tools are not destructive by that rule and carry no hint.
- Every reference parameter (project, board, funnel, custom field, option, member) is `nameOrId`; an id passes through, a name resolves. Task ids stay numeric ids.
- **Booleans the API wants as 0/1** (`all`, `completed`) are converted in the layer that builds the query — never sent as `true`/`false`.
- Closed sets get closed types (`as const` + derived union); exhaustive branches end in a `never` check; options objects for ≥ 3 params or same-typed params; constants and types in separate files (`src/api/constants.ts` / `src/api/types.ts`).
- Normalisers take `unknown`, never `any` (Task 2 makes this the rule for the existing ones; every new one follows it).
- `spec/`, `scripts/`, `tests/`, `docs/` are not shipped: `package.json` `files` stays `["dist"]`.

## Review Focus

1. **A select value given by option name must reach the wire as the option id**, and an unknown option name must fail with candidates before any write — `weeek_update_task { id, fields: { "Stage": "Reviw" } }` names the two closest options, sends nothing. → tests in Task 8 (`encodeTaskFields`) and Task 7 (`pickOption`).
2. **A field name that lives in another scope must not be written through the wrong route.** `weeek_delete_custom_field { scope: "board", board: 10, field: "Estimate" }` where Estimate is a global field: the board list is derived minus global and project fields, so the name does not resolve in board scope and the tool reports candidates: none — it never sends `DELETE /tm/boards/10/custom-fields/<global id>`. → test in Task 5 (`list` subtracts) and Task 7.
3. **A funnel id must never be mistaken for a name, nor a name for an id.** `weeek_list_custom_fields { scope: "funnel", funnel: "OLY24hy2mC7n9D9l" }` and `{ funnel: "Sales" }` both resolve through the funnel list; an id the list does not hold fails with candidates instead of being sent as-is. → tests in Task 6.
4. **`move` must send exactly one of `after`/`before`.** The spec marks both required and says they are exclusive; a tool call with both, or neither, is rejected before any request; a call with one sends only that key. → tests in Task 7.
5. **A PUT on an option replaces both `name` and `color`**; `weeek_update_field_option { …, color: "red" }` must keep the option's current name. The option comes from the field's inline list, so no extra read. → test in Task 7.
6. **A thing created, then named in the next call**: create field "Estimate", then `weeek_update_task { fields: { "Estimate": 5 } }` within 60 s. Every field write forgets the `fields` cache family. → tests in Task 7 (each write tool) and Task 6 (`forget`).

---

## File structure after Phase 3

```
tsconfig.tests.json               typecheck for tests/ (Task 1)
package.json                      typecheck runs both configs; version 0.7.0 (Tasks 1, 9)
src/operations.ts                 + globalFields, projectFields, boardFields, funnelFields, funnels.list — 39 operations (Task 4)
src/api/constants.ts              + fieldTypes, fieldScopes, transferTargetKinds, optionColors, numberFormats, booleanStyles (Task 5)
src/api/types.ts                  + TaskPriorityCode (Task 2); FieldType, OptionColor, NumberFormat, BooleanStyle, NumberFieldConfig,
                                    BooleanFieldConfig, FieldConfig, CustomFieldOption, CustomField, NewCustomField, CustomFieldUpdate,
                                    NewFieldOption, FieldScope, TransferTarget, Placement, Funnel, FieldValue, TaskFieldValue;
                                    Project + customFields; WeeekTask + customFields; NewTask + customFields (Tasks 5, 8)
src/api/responses.ts              + asRecord, isOneOf, toWorkspace (Task 2)
src/api/priority.ts               priorityCode returns TaskPriorityCode (Task 2)
src/api/custom-fields.ts          CustomFieldsApi, toCustomField, toFieldOption (Task 5)
src/api/crm/funnels.ts            FunnelsApi.list, toFunnel (Task 5)
src/api/tasks.ts                  normalisers on unknown; removeComment → SuccessResponse (Task 2); getFields, sampleBoardFields (Task 5);
                                    customFields on the task and on create (Task 8)
src/api/projects.ts · boards.ts · columns.ts · tags.ts · portfolios.ts · workspace.ts   normalisers on unknown (Task 2)
src/client.ts                     + customFields, crm.funnels (Task 5)
src/config.ts                     single-pass toolset validation (Task 2)
src/dates.ts                      + parseDateTime (Task 8)
src/resolver.ts                   entry-typed kinds, list/find, opaque shape, funnel + customField kinds (Task 6)
src/tools/members.ts              resolveMembers, de-duplicated (Task 2)
src/tools/task-links.ts           imports resolveMembers (Task 2)
src/tools/comments.ts             returns the client's SuccessResponse (Task 2)
src/tools/tasks.ts                CreateInput/UpdateInput derived from the shapes (Task 2); fields on create/update (Task 8)
src/tools/field-refs.ts           fieldScopeShape, parseFieldScope, fieldConfigShape, buildFieldConfig, pickOption, placementShape, parsePlacement (Task 7)
src/tools/custom-fields.ts        the custom-fields toolset — 10 tools (Task 7)
src/tools/field-values.ts         fieldValues schema, encodeTaskFields (Task 8)
src/toolsets/constants.ts         toolsetNames = ["tasks", "time", "projects", "custom-fields", "all"] (Task 7)
src/toolsets/register.ts          + "custom-fields": registerCustomFieldTools (Task 7)
tests/helpers/http.ts             typed fetch stubs (Task 1)
tests/helpers/tool-names.ts       + customFieldToolNames (Task 7)
tests/api/custom-fields.test.ts · tests/api/crm/funnels.test.ts   new (Task 5)
tests/tools/field-refs.test.ts · tests/tools/custom-fields.test.ts · tests/tools/field-values.test.ts · tests/tools/members.test.ts   new (Tasks 2, 7, 8)
README.md · docs/FOLLOWUPS.md · manifest.json · server.json   (Task 9)
```

Tool inventory after Phase 3 — `tools/list` for `all` holds 64 tools:

| Toolset | Tools | Count |
|---|---|---|
| `tasks` (default) | unchanged names; `weeek_create_task`, `weeek_create_tasks`, `weeek_update_task` gain `fields`; `weeek_get_task` and `weeek_list_tasks` return `customFields` | 24 |
| `time` | unchanged | 4 |
| `projects` | unchanged; `weeek_get_project` returns `customFields` | 25 |
| `custom-fields` | `weeek_list_custom_fields`, `weeek_create_custom_field`, `weeek_update_custom_field`, `weeek_delete_custom_field`, `weeek_transfer_custom_field`, `weeek_move_custom_field`, `weeek_add_field_option`, `weeek_update_field_option`, `weeek_delete_field_option`, `weeek_move_field_option` | 10 |
| always | `weeek_version` | 1 |

Why the default toolset gains no tool: field administration is rare and belongs behind an opt-in; reading and setting values is what a task user needs, and that fits into the three task tools that already exist, so the Glama tool count for the default install does not move.

---

### Task 1: Typecheck `tests/` in CI (FOLLOWUPS #20)

The tests are not compiled today (`tsconfig.json` includes `src` only), so a fixture can drift from its type without anyone noticing. This task adds a second tsconfig for `tests/`, wires it into `npm run typecheck` (which CI already runs on every PR), and fixes the 18 errors it reports — all in test code, no behaviour change.

**Files:**
- Create: `tsconfig.tests.json`
- Modify: `package.json` (`typecheck` script)
- Modify: `tests/helpers/http.ts` (typed fetch stubs)
- Modify: `tests/client.test.ts:26-30`, `tests/tools/tasks.test.ts` (the four `list.mock.calls[0][0]` tests), `tests/tools/projects.test.ts:5`, `tests/tools/workspace.test.ts:5-7`
- Modify: `docs/FOLLOWUPS.md` (#20: strike the typecheck bullet)

**Interfaces:**
- Produces: `FetchStub` type and `jsonFetch`/`binaryFetch` returning `Mock<FetchStub>` in `tests/helpers/http.ts`; `npm run typecheck` fails on a type error anywhere under `tests/`.

- [ ] **Step 1: Add the tests tsconfig and the script, and see the 18 errors**

Create `tsconfig.tests.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "rootDir": ".", "declaration": false },
  "include": ["src", "tests"]
}
```

In `package.json` change the script to:

```json
    "typecheck": "tsc --noEmit && tsc -p tsconfig.tests.json",
```

Run: `npm run typecheck`
Expected: FAIL with 18 `error TS…` lines in `tests/client.test.ts`, `tests/http.test.ts`, `tests/tools/projects.test.ts`, `tests/tools/tasks.test.ts`, `tests/tools/workspace.test.ts`.

- [ ] **Step 2: Type the fetch stubs once, in the helper**

Replace `tests/helpers/http.ts` with:

```ts
import { vi, type Mock } from "vitest";
import { HttpClient, type HttpConfig } from "../../src/http.js";

const token = "t".repeat(24);

export const httpConfig: HttpConfig = { token, baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000 };
export const bearer = `Bearer ${token}`;

/** fetch's shape, so a stub's recorded calls are typed `[url, init]` instead of an empty tuple. */
export type FetchStub = (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export function jsonFetch(status: number, body: unknown): Mock<FetchStub> {
  return vi.fn<FetchStub>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
export function binaryFetch(status: number, bytes: Uint8Array, contentType: string): Mock<FetchStub> {
  return vi.fn<FetchStub>(async () => new Response(bytes as unknown as BodyInit, { status, headers: { "content-type": contentType } }));
}
export function httpWith(f: Mock<FetchStub>) {
  return new HttpClient(httpConfig, f as unknown as typeof fetch);
}
export function sent(f: Mock<FetchStub>, call = 0) {
  const [url, init = {}] = f.mock.calls[call];
  return { url: String(url), init, json: () => JSON.parse(init.body as string) };
}
```

- [ ] **Step 3: Fix the remaining errors where the stub is built inline**

`tests/http.test.ts` — the download tests build their stub inline (`vi.fn().mockResolvedValueOnce(…)`) and then read `f.mock.calls[…]`; make each of those `vi.fn<FetchStub>()` (import `type FetchStub` from `./helpers/http.js`). The same applies to every other inline `vi.fn()` that is handed to `httpWith` or `sent` (`tests/api/tasks.test.ts` "addLocation …", `tests/api/attachments.test.ts`): the gate in Step 4 names each one as `Mock<Procedure>` not assignable to `Mock<FetchStub>`; type it `vi.fn<FetchStub>()`, never widen the helper back.

`tests/client.test.ts`, the "routes every resource client through the same injected fetch" test — use the helper instead of an inline `vi.fn`:

```ts
  it("routes every resource client through the same injected fetch", async () => {
    const f = jsonFetch(200, { success: true, projects: [] });
    const c = new WeeekClient(httpConfig, f as unknown as typeof fetch);
    await c.projects.list();
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/projects");
  });
```

and add `jsonFetch, sent` to the import from `./helpers/http.js`.

`tests/tools/tasks.test.ts` — the four tests that read `list.mock.calls[0][0]` ("with no args applies the default perPage/offset", "with a projectId filter…", "forwards server-side user, status, and date filters", "forwards the Phase 2 filters…") build `vi.fn(async () => [])`, whose calls are typed as an empty tuple. Declare one typed stub factory under `baseClient` and use it in all four:

```ts
/** A tasks.list stub whose recorded query is typed, so `list.mock.calls[0][0]` compiles. */
const listStub = () => vi.fn(async (_query: Record<string, unknown>): Promise<unknown[]> => []);
```

and in each of the four tests replace `const list = vi.fn(async () => []);` with `const list = listStub();`.

`tests/tools/projects.test.ts` line 5 — type the fixture so `portfolioId: null` is `number | null`:

```ts
import type { Project } from "../../src/client.js";

const marketing: Project = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: null, team: [] };
```

`tests/tools/workspace.test.ts` lines 5–7 — type the portfolio fixture and give the `list` stub a parameter so `mockImplementation` with one compiles:

```ts
import type { Portfolio, PortfolioQuery } from "../../src/client.js";

const clients: Portfolio = { id: 7, name: "Clients", parentId: null, isPrivate: false };
const urgent = { id: 5, title: "Urgent", color: "#f00" };
const client = () => ({
  portfolios: { list: vi.fn(async (_query: PortfolioQuery = {}) => ({ portfolios: [clients], hasMore: false })), get: vi.fn(async () => clients) },
```

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm test`
Expected: both tsc passes clean; 267 tests pass.

- [ ] **Step 5: FOLLOWUPS**

In `docs/FOLLOWUPS.md` item 20, change the typecheck bullet to:

```markdown
    - ~~Typecheck `tests/` in CI (a `tsconfig.tests.json`); tidy the pre-existing `vi.fn()` tuple errors it reports first.~~ — RESOLVED (Phase 3, Task 1): `npm run typecheck` runs both configs; the 18 errors were untyped fetch stubs and two fixtures with literal-`null` fields.
```

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add tsconfig.tests.json package.json tests/helpers/http.ts tests/client.test.ts tests/tools/tasks.test.ts tests/tools/projects.test.ts tests/tools/workspace.test.ts docs/FOLLOWUPS.md
git commit -m "test: typecheck the tests folder in ci"
```

---

### Task 2: Phase 3 entry list — code minors (FOLLOWUPS #20, #22)

The small code items the Phase 2 review deferred. None changes a tool's behaviour except two documented widenings: `weeek_update_task` may clear tags with `[]`, and `resolveMembers` de-duplicates. The `weeek_update_project` colour check stays as it is — FOLLOWUPS #21(f) (the tag colour format) is not settled yet.

**Files:**
- Modify: `src/api/responses.ts` (`asRecord`, `isOneOf`, `toWorkspace`; `toMember`/`toProfile` on unknown)
- Modify: `src/api/tasks.ts`, `src/api/projects.ts`, `src/api/boards.ts`, `src/api/columns.ts`, `src/api/tags.ts`, `src/api/portfolios.ts`, `src/api/workspace.ts` (normalisers on unknown)
- Modify: `src/api/types.ts` (`TaskPriorityCode`; `NewTask.priority`), `src/api/priority.ts`
- Modify: `src/tools/comments.ts`, `src/tools/tasks.ts`, `src/tools/task-links.ts`, `src/config.ts`
- Create: `src/tools/members.ts`, `tests/tools/members.test.ts`
- Modify: `tests/api/responses.test.ts`, `tests/api/workspace.test.ts`, `tests/api/tasks.test.ts`, `tests/tools/tasks.test.ts`, `tests/config.test.ts`, `docs/FOLLOWUPS.md`

**Interfaces:**
- Produces: `asRecord(raw: unknown): Record<string, unknown>`, `isOneOf<T extends readonly (string | number)[]>(list: T, value: unknown): value is T[number]`, `toWorkspace(raw: unknown): Workspace` in `src/api/responses.ts`; `TaskPriorityCode` in `src/api/types.ts`; `resolveMembers(resolver, values): Promise<string[]>` in `src/tools/members.ts`; `TasksApi.removeComment` returns `Promise<SuccessResponse>`.
- Later tasks write every new normaliser with `asRecord` and `isOneOf`.

- [ ] **Step 1: Write the failing tests for the shared normaliser helpers**

Append to `tests/api/responses.test.ts`:

```ts
describe("asRecord", () => {
  it("returns the object itself, and {} for anything that is not one", () => {
    const record = { id: 1 };
    expect(asRecord(record)).toBe(record);
    expect(asRecord(null)).toEqual({});
    expect(asRecord("x")).toEqual({});
    expect(asRecord(undefined)).toEqual({});
  });
});

describe("isOneOf", () => {
  it("narrows a value to a member of a closed list, for strings and numbers", () => {
    expect(isOneOf(["a", "b"] as const, "a")).toBe(true);
    expect(isOneOf(["a", "b"] as const, "c")).toBe(false);
    expect(isOneOf([1, 2] as const, 2)).toBe(true);
    expect(isOneOf([1, 2] as const, "2")).toBe(false);
  });
});

describe("toWorkspace", () => {
  it("normalises the workspace and nulls a missing description", () => {
    expect(toWorkspace({ id: "3", title: "Acme", isPersonal: 1 })).toEqual({ id: 3, title: "Acme", description: null, isPersonal: true });
  });
});
```

and extend the import: `import { asRecord, isOneOf, pickArray, toMember, toProfile, toWorkspace } from "../../src/api/responses.js";`.

`tests/api/workspace.test.ts` needs no change: it keeps exercising `toWorkspace` through `WorkspaceApi.get`.

Append to `tests/api/tasks.test.ts`, inside `describe("TasksApi", …)`:

```ts
  it("removeComment answers with the success envelope after a 204", async () => {
    const f = vi.fn<FetchStub>(async () => new Response(null, { status: 204 }));
    expect(await new TasksApi(httpWith(f)).removeComment({ taskId: 78, commentId: 5 })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
  });
```

(import `type FetchStub` from `../helpers/http.js`; the existing "removeComment DELETEs and accepts an empty 204 body" test keeps its URL assertion — merge the two into one if they overlap, declaring the fetch once.)

Create `tests/tools/members.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { resolveMembers } from "../../src/tools/members.js";
import { stubMembers } from "../helpers/tool-harness.js";

const [ilya, ann] = stubMembers;
const resolver = () => new Resolver({ workspace: { listMembers: async () => stubMembers } } as any, new NameCache(100_000, () => 0));

describe("resolveMembers", () => {
  it("resolves names and passes ids through", async () => {
    expect(await resolveMembers(resolver(), ["ilya", ann.id])).toEqual([ilya.id, ann.id]);
  });
  it("de-duplicates a member named twice, by name and by id", async () => {
    expect(await resolveMembers(resolver(), ["Ilya", ilya.id, "ilya"])).toEqual([ilya.id]);
  });
});
```

Append to `tests/tools/tasks.test.ts`:

```ts
  it("update_task clears the tags when given an empty list", async () => {
    const update = vi.fn(async (id: number, patch: any) => ({ id, ...patch }));
    const h = harness({ ...baseClient, tasks: { update } });
    await h.get("weeek_update_task")!({ id: 3, tags: [] });
    expect(update).toHaveBeenCalledWith(3, { tags: [] });
  });

  it("create_task sends the priority as a code the closed type allows", async () => {
    const create = vi.fn(async (b: any) => ({ id: 5, ...b }));
    const h = harness({ ...baseClient, tasks: { create } });
    await h.get("weeek_create_task")!({ title: "x", project: "Marketing", priority: "low" });
    expect(create).toHaveBeenCalledWith({ title: "x", projectId: 1, priority: 0 });
  });
```

Replace the "keeps the parsed names typed without a cast" test in `tests/config.test.ts` with one that can fail:

```ts
  it("validates each name once and keeps the parsed names typed", () => {
    expect(parseToolsets("Tasks, tasks ,TIME")).toEqual(["tasks", "time"]);
    expect(toolsetNames.every(isToolsetName)).toBe(true);
    expect(isToolsetName("crm")).toBe(false);
    expect(isToolsetName("Tasks")).toBe(false);
  });
```

and import `isToolsetName` from `../src/config.js`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/api/responses.test.ts tests/api/tasks.test.ts tests/tools/members.test.ts tests/tools/tasks.test.ts tests/config.test.ts`
Expected: FAIL — `asRecord`/`isOneOf`/`toWorkspace` not exported; `removeComment` resolves to `undefined`; `members.js` missing; `tags: []` rejected by `min(1)`; `isToolsetName("Tasks")` — passes already (the test fails only on the other lines).

- [ ] **Step 3: Shared helpers and normalisers on `unknown`**

`src/api/responses.ts` — replace the file:

```ts
import type { Member, Profile, Workspace } from "./types.js";

/** The API's JSON is untyped until a normaliser reads it; this is the one place that assumption is made. */
export function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

/** True when `value` is a member of the closed list, narrowing it; the wire sends plain strings and numbers. */
export function isOneOf<T extends readonly (string | number)[]>(list: T, value: unknown): value is T[number] {
  return (list as readonly unknown[]).includes(value);
}

/** The API wraps lists under a resource-specific key; fall back to the first array present. */
export function pickArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (Array.isArray(v)) return v;
  for (const value of Object.values(obj)) if (Array.isArray(value)) return value;
  return [];
}

export function toMember(raw: unknown): Member {
  const r = asRecord(raw);
  const joined = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  const name = joined || r.name || r.email || String(r.id ?? "");
  return { id: String(r.id ?? ""), name: String(name) };
}

export function toProfile(raw: unknown): Profile {
  const r = asRecord(raw);
  return {
    ...toMember(r),
    email: String(r.email ?? ""),
    language: r.language == null ? null : String(r.language),
    timeZone: r.timeZone == null ? null : String(r.timeZone),
  };
}

export function toWorkspace(raw: unknown): Workspace {
  const r = asRecord(raw);
  return { id: Number(r.id), title: String(r.title ?? ""), description: r.description == null ? null : String(r.description), isPersonal: Boolean(r.isPersonal) };
}
```

`src/api/workspace.ts` — `get` becomes:

```ts
  async get(): Promise<Workspace> {
    const json = await this.http.execute<{ workspace: unknown }>(operations.workspace.get);
    return toWorkspace(json.workspace);
  }
```

(import `toWorkspace` from `./responses.js`; drop the now-unused `Workspace` import if only the return type needs it — keep `import type { Member, Workspace }`.)

Each normaliser gets the same mechanical change — the parameter is `unknown`, the first line is `const r = asRecord(raw);`, every `raw.x` becomes `r.x`:

`src/api/tags.ts`:

```ts
export function toTag(raw: unknown): Tag {
  const r = asRecord(raw);
  return { id: Number(r.id), title: String(r.title ?? ""), color: String(r.color ?? "") };
}
```

`src/api/boards.ts`:

```ts
export function toBoard(raw: unknown): Board {
  const r = asRecord(raw);
  return { id: Number(r.id), name: String(r.name ?? ""), projectId: Number(r.projectId), isPrivate: Boolean(r.isPrivate) };
}
```

`src/api/columns.ts`:

```ts
export function toColumn(raw: unknown): BoardColumn {
  const r = asRecord(raw);
  return { id: Number(r.id), name: String(r.name ?? ""), boardId: Number(r.boardId) };
}
```

`src/api/portfolios.ts` — the normaliser, and `create` sends the typed object (JSON.stringify drops an `undefined` parentId, so no hand-built record):

```ts
export function toPortfolio(raw: unknown): Portfolio {
  const r = asRecord(raw);
  return { id: Number(r.id), name: String(r.name ?? ""), parentId: r.parentId == null ? null : Number(r.parentId), isPrivate: Boolean(r.isPrivate) };
}
…
  async create(newPortfolio: NewPortfolio): Promise<Portfolio> {
    const json = await this.http.execute<{ data: unknown }>(ops.create, { body: newPortfolio });
    return toPortfolio(json.data);
  }
```

`src/api/projects.ts`:

```ts
export function toProject(raw: unknown): Project {
  const r = asRecord(raw);
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    description: r.description == null ? null : String(r.description),
    color: r.color == null ? null : String(r.color),
    status: isOneOf(projectStatuses, r.status) ? r.status : null,
    isPrivate: Boolean(r.isPrivate),
    portfolioId: r.portfolioId == null ? null : Number(r.portfolioId),
    team: Array.isArray(r.team) ? r.team.map(String) : [],
  };
}
```

(import `asRecord, isOneOf, pickArray` from `./responses.js`; the `ProjectStatus` type import goes if nothing else uses it.)

`src/api/tasks.ts` — the four normalisers:

```ts
function toLocation(raw: unknown): TaskLocation {
  const r = asRecord(raw);
  return { projectId: Number(r.projectId), boardId: optionalNumber(r.boardId), boardColumnId: optionalNumber(r.boardColumnId) };
}

export function toTimeEntry(raw: unknown): TimeEntry {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""), userId: String(r.userId ?? ""), date: String(r.date ?? ""),
    duration: Number(r.duration ?? 0), isOvertime: Boolean(r.isOvertime), comment: r.comment == null ? "" : String(r.comment),
  };
}

function toComment(raw: unknown): TaskComment {
  const r = asRecord(raw);
  return {
    id: Number(r.id), parentId: optionalNumber(r.parentId), authorId: String(r.authorId ?? ""),
    markdown: String(r.markdown ?? ""), createdAt: String(r.createdAt ?? ""), updatedAt: String(r.updatedAt ?? ""),
  };
}

function toTask(raw: unknown): WeeekTask {
  const r = asRecord(raw);
  return {
    id: Number(r.id),
    title: String(r.title ?? ""),
    description: r.description == null ? null : String(r.description),
    projectId: optionalNumber(r.projectId),
    boardId: optionalNumber(r.boardId),
    boardColumnId: optionalNumber(r.boardColumnId),
    parentId: optionalNumber(r.parentId),
    subTasks: Array.isArray(r.subTasks) ? r.subTasks.map(Number) : [],
    assignees: Array.isArray(r.assignees) ? r.assignees.map(String) : [],
    // The API calls watchers "subscribers" on the task and "watchers" on the endpoint that sets them.
    watchers: Array.isArray(r.subscribers) ? r.subscribers.map(String) : [],
    authorId: optionalString(r.authorId),
    priority: priorityName(r.priority),
    type: isOneOf(taskTypes, r.type) ? r.type : null,
    startDate: optionalString(r.startDate),
    dueDate: optionalString(r.dueDate),
    completed: Boolean(r.isCompleted ?? r.completed ?? false),
    completedAt: optionalString(r.completedAt),
    createdAt: optionalString(r.createdAt),
    duration: optionalNumber(r.duration),
    tags: Array.isArray(r.tags) ? r.tags.map(Number) : [],
    locations: Array.isArray(r.locations) ? r.locations.map(toLocation) : [],
    timeEntries: Array.isArray(r.timeEntries) ? r.timeEntries.map(toTimeEntry) : [],
    // The API returns these with every task; surfacing them is what lets a caller see a
    // screenshot-only description instead of silently working from the prose.
    attachments: Array.isArray(r.attachments) ? (r.attachments as Attachment[]) : [],
  };
}
```

(import `asRecord, isOneOf, pickArray` from `./responses.js`; drop the `TaskType` import if now unused.) And `removeComment` answers like every other 204/success route:

```ts
  async removeComment({ taskId, commentId }: CommentRef): Promise<SuccessResponse> {
    // The API answers 204 with no body; the envelope every other delete returns is built here, once.
    await this.http.execute(ops.removeComment, { params: { taskId, commentId } });
    return { success: true };
  }
```

`src/tools/comments.ts` — the delete handler becomes `async (args) => client.tasks.removeComment({ taskId: args.id, commentId: args.comment_id })`.

- [ ] **Step 4: The priority code type**

`src/api/types.ts`, after `TaskType`:

```ts
/** A wire priority is an index into taskPriorities (0 low … 3 hold); derived from the tuple so the two cannot drift. */
export type TaskPriorityCode = Exclude<Partial<typeof taskPriorities>["length"], (typeof taskPriorities)["length"]>;
```

and in `NewTask`: `priority?: TaskPriorityCode;` (keep the "use priorityCode() to build it" comment).

`src/api/priority.ts`:

```ts
import { taskPriorities } from "./constants.js";
import type { TaskPriority, TaskPriorityCode } from "./types.js";

export function priorityCode(name: TaskPriority): TaskPriorityCode {
  // indexOf is typed number; a TaskPriority is always in the tuple, so the index is one of its positions.
  return taskPriorities.indexOf(name) as TaskPriorityCode;
}
```

(`priorityName` unchanged.)

- [ ] **Step 5: Members helper, task input types, tags `[]`, config single pass**

Create `src/tools/members.ts`:

```ts
import type { Resolver } from "../resolver.js";

/** Member ids for a list of names or ids, in order, each member once even if named twice. */
export async function resolveMembers(resolver: Resolver, values: Array<string | number>): Promise<string[]> {
  const ids = await Promise.all(values.map((value) => resolver.resolve({ kind: "member", value })));
  return [...new Set(ids)];
}
```

In `src/tools/task-links.ts` delete the local `resolveMembers` and import it: `import { resolveMembers } from "./members.js";` (drop the now-unused `Resolver` type import).

In `src/tools/tasks.ts`, move `createShape` above `buildNewTask`, add `updateShape`, and derive the input types from them instead of restating the fields:

```ts
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
type CreateInput = z.infer<z.ZodObject<typeof createShape>>;

const updateShape = {
  id: taskId,
  title: z.string().optional(),
  due: z.string().optional(),
  start: z.string().optional(),
  priority: z.enum(taskPriorities).optional(),
  type: z.enum(taskTypes).optional(),
  duration: z.number().int().min(0).optional(),
  tags: z.array(nameOrId).max(50).optional().describe("Replaces the task's tags; an empty list clears them."),
};
type UpdateInput = z.infer<z.ZodObject<typeof updateShape>>;
```

`weeek_update_task` registers with `inputSchema: updateShape` and its description's tags clause becomes "and `tags` by name or id (replaces the task's tags; an empty list clears them)". `buildTaskPatch` is unchanged (`patch.tags = []` already flows through). The old `interface CreateInput`/`interface UpdateInput` blocks go.

`src/config.ts` — one pass that both validates and narrows:

```ts
export function parseToolsets(raw: string | undefined): ToolsetName[] {
  const names = [...new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0))];
  if (names.length === 0) return [...defaultToolsets];
  const known: ToolsetName[] = [];
  for (const name of names) {
    if (!isToolsetName(name)) throw new Error(`invalid config: WEEEK_TOOLSETS: unknown toolset "${name}"; valid values: ${toolsetNames.join(", ")}`);
    known.push(name);
  }
  return known;
}
```

- [ ] **Step 6: Run the gate**

Run: `npm run typecheck && npm test`
Expected: clean; all tests green (272 or so).

- [ ] **Step 7: FOLLOWUPS**

In item 20 strike the `raw: any` bullet (` — RESOLVED (Phase 3, Task 2): every normaliser takes unknown through asRecord`). In item 22 strike: `weeek_update_task` tags clearing (`[]` clears, Phase 3 Task 2), `NewTask.priority` closed type, the inline workspace normaliser, the portfolio Record body, the comments literal, CreateInput/UpdateInput derivation, resolveMembers de-dup, config double validation. Leave the project colour bullet with "pending #21(f)". The resolver bullets are struck in Task 6.

- [ ] **Step 8: Commit (after go-ahead)**

```bash
git add src/api src/tools src/config.ts tests/api tests/tools tests/config.test.ts docs/FOLLOWUPS.md
git commit -m "refactor: normalisers on unknown, closed priority code, shared member resolution"
```

---

### Task 3: Phase 3 entry list — test gaps (FOLLOWUPS #22)

Tests the Phase 2 review found missing. No source change; a test that fails here is a finding, not a fixture problem — stop and report it.

**Files:**
- Modify: `tests/operations.test.ts`, `tests/api/tasks.test.ts`, `tests/api/boards.test.ts`, `tests/api/columns.test.ts`, `tests/api/projects.test.ts`, `tests/api/portfolios.test.ts`, `tests/api/tags.test.ts`, `tests/tools/tasks.test.ts`, `tests/tools/time.test.ts`, `tests/tools/task-links.test.ts`, `tests/tools/projects.test.ts`, `tests/tools/workspace.test.ts`, `docs/FOLLOWUPS.md`

- [ ] **Step 1: Registry — every path parameter is an `…Id`**

In `tests/operations.test.ts`, in the camelCase test replace the regex line with:

```ts
      for (const param of op.path.match(/\{[^}]+\}/g) ?? []) expect(param).toMatch(/^\{[a-z]+Id\}$/);
```

- [ ] **Step 2: Normaliser edge cases**

Append to `tests/api/tasks.test.ts` inside the `describe`:

```ts
  it("get drops malformed locations and timeEntries instead of failing", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, locations: "x", timeEntries: null } });
    const t = await new TasksApi(httpWith(f)).get(78);
    expect(t.locations).toEqual([]);
    expect(t.timeEntries).toEqual([]);
  });
```

Move the four time-entry fixtures (`entryFields`, `entryBody`, `rawEntry`, `entry`) from mid-`describe` to the top of the file beside `rawTask`, renaming `entry` → `expectedEntry` and updating its three uses.

Append to `tests/api/boards.test.ts`:

```ts
  it("list coerces ids and defaults a missing name and privacy", async () => {
    const f = jsonFetch(200, { success: true, boards: [{ id: "10", projectId: "2" }] });
    expect(await new BoardsApi(httpWith(f)).list(2)).toEqual([{ id: 10, name: "", projectId: 2, isPrivate: false }]);
  });
```

Append to `tests/api/columns.test.ts`:

```ts
  it("list coerces ids and defaults a missing name", async () => {
    const f = jsonFetch(200, { success: true, boardColumns: [{ id: "100", boardId: "10" }] });
    expect(await new ColumnsApi(httpWith(f)).list(10)).toEqual([{ id: 100, name: "", boardId: 10 }]);
  });
```

Append to `tests/api/projects.test.ts`:

```ts
  it("update omits color when not given and tolerates a non-array team", async () => {
    const f = jsonFetch(200, { success: true, project: { ...rawProject, team: "nope" } });
    const updated = await new ProjectsApi(httpWith(f)).update({ projectId: 1, update: { name: "M2", isPrivate: false } });
    expect(sent(f, 0).json()).toEqual({ name: "M2", isPrivate: 0 });
    expect(updated.team).toEqual([]);
  });
```

Append to `tests/api/portfolios.test.ts`:

```ts
  it("list forwards parentId and offset and reports hasMore", async () => {
    const f = jsonFetch(200, { success: true, data: [portfolio], hasMore: true });
    const page = await new PortfoliosApi(httpWith(f)).list({ parentId: 3, limit: 1, offset: 5 });
    expect(page.hasMore).toBe(true);
    expect(sent(f).url).toBe(`${base}?parentId=3&limit=1&offset=5`);
  });
```

In `tests/api/tags.test.ts`, in "update PUTs title + color then re-reads the tag" add after the last line: `expect(sent(f, 1).init.method).toBe("GET");`.

- [ ] **Step 3: Tool cases**

Append to `tests/tools/tasks.test.ts`:

```ts
  it("weeek_list_tasks sends completed and all both as 1 when both are set", async () => {
    const list = listStub();
    const h = harness({ tasks: { list } });
    await h.get("weeek_list_tasks")!({ completed: true, all: true });
    expect(list.mock.calls[0][0]).toMatchObject({ completed: 1, all: 1 });
  });
```

Make the three bare `toThrow()` calls name what they reject:
- `tests/tools/tasks.test.ts` "rejects a priority outside the four names": `.rejects.toThrow(/priority/)`.
- `tests/tools/time.test.ts` "rejects more than a day of minutes": `.toThrow(/minutes/)`.
- `tests/tools/task-links.test.ts` line 71 (`weeek_set_task_parent` without `parent`): `.toThrow(/parent/)`.

In `tests/tools/projects.test.ts`, the two tests that warm the cache "through a failing call" (`weeek_create_board …` and `weeek_create_column …`) replace the `.catch(() => undefined)` warm-ups with a resolve that succeeds:

```ts
    await h.resolver.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } }); // warms boards:1
```

and, in the column test:

```ts
    await h.resolver.resolve({ kind: "column", value: "Done", scope: { boardId: 10 } }); // warms board-columns:10
```

(The trailing re-resolve in each test stays as a tool call, since it asserts the tool forgot.)

In `tests/tools/workspace.test.ts`:
- In "weeek_create_portfolio resolves the parent and makes the new name resolvable at once", after `expect(before.isError).toBe(true);` add `expect(reply(before).error).toMatch(/could not resolve portfolio "Internal"/);`.
- Of the two `weeek_update_tag` merge tests, keep "merges over the current tag so an omitted field survives" and delete the earlier one that asserts the same call with a different colour (the one between the create-tag test and the merge test, if present; if only one exists, nothing to delete).

- [ ] **Step 4: Run the gate**

Run: `npm run typecheck && npm test`
Expected: green. A red test here means a Phase 2 bug — stop and report before changing source.

- [ ] **Step 5: FOLLOWUPS and commit (after go-ahead)**

Strike every test-gap bullet of item 22 (` — RESOLVED (Phase 3, Task 3)`).

```bash
git add tests docs/FOLLOWUPS.md
git commit -m "test: close the phase 2 review's test gaps"
```

---

### Task 4: Operation registry — 39 operations

Register every custom-field operation plus `GET /crm/funnels`; the contract test's Phase 3 block goes, and `GET /crm/funnels` leaves the Phase 4 block.

**Files:**
- Modify: `src/operations.ts`
- Modify: `tests/contract.test.ts` (delete the Phase 3 block; drop `"GET /crm/funnels"` from Phase 4)
- Modify: `tests/operations.test.ts` (count 56 → 95; new placeholder assertions)

**Interfaces:**
- Produces: `operations.globalFields`, `operations.projectFields`, `operations.boardFields`, `operations.funnelFields`, `operations.funnels.list`. Path parameters are `{fieldId}`, `{optionId}`, `{projectId}`, `{boardId}`, `{funnelId}`.
- The four field groups share the member names `create`, `update`, `remove`, `createOption`, `updateOption`, `removeOption`, `moveOption`; `global`/`project`/`board` add `transferToProject`, `transferToBoard`; `project`/`board` add `transferToGlobal`; `global` adds `list`; `funnel` adds `move`. Task 5 relies on these names being identical across groups.

- [ ] **Step 1: Make the tests demand the registrations**

In `tests/contract.test.ts` delete the whole `// ── Phase 3 · custom fields …` block (the twelve lines of strings under it) and remove `"GET /crm/funnels", ` from the first Phase 4 line, which becomes:

```ts
  "POST /crm/funnels", "GET /crm/funnels/{}", "PUT /crm/funnels/{}", "DELETE /crm/funnels/{}",
```

In `tests/operations.test.ts` change `expect(all.length).toBe(56);` to `expect(all.length).toBe(95);` and add to the camelCase test, before the loop:

```ts
    expect(operations.globalFields.updateOption.path).toBe("/tm/custom-fields/{fieldId}/options/{optionId}");
    expect(operations.projectFields.transferToGlobal.path).toBe("/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-task-manager");
    expect(operations.boardFields.moveOption.path).toBe("/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}/move");
    expect(operations.funnelFields.move.path).toBe("/crm/funnels/{funnelId}/custom-fields/{fieldId}/move");
    expect(operations.funnels.list.path).toBe("/crm/funnels");
```

Run: `npx vitest run tests/contract.test.ts tests/operations.test.ts`
Expected: FAIL — "in the spec, not registered, not deferred" lists 39 operations; count is 56; `globalFields` is undefined.

- [ ] **Step 2: Register them**

In `src/operations.ts`, after the `attachments` group and before `} as const satisfies …`, add:

```ts
  // Custom fields: the same CRUD per scope. The four groups share member names so one
  // client method can pick a group by scope and call the same member (src/api/custom-fields.ts).
  globalFields: {
    list: { method: "GET", path: "/tm/custom-fields" },
    create: { method: "POST", path: "/tm/custom-fields" },
    update: { method: "PUT", path: "/tm/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/tm/custom-fields/{fieldId}" },
    transferToProject: { method: "POST", path: "/tm/custom-fields/{fieldId}/transfer-to-project" },
    transferToBoard: { method: "POST", path: "/tm/custom-fields/{fieldId}/transfer-to-board" },
    createOption: { method: "POST", path: "/tm/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/tm/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/tm/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/tm/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  projectFields: {
    create: { method: "POST", path: "/tm/projects/{projectId}/custom-fields" },
    update: { method: "PUT", path: "/tm/projects/{projectId}/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/tm/projects/{projectId}/custom-fields/{fieldId}" },
    // The API calls the global scope "task manager".
    transferToGlobal: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-task-manager" },
    transferToProject: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-project" },
    transferToBoard: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-board" },
    createOption: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  boardFields: {
    create: { method: "POST", path: "/tm/boards/{boardId}/custom-fields" },
    update: { method: "PUT", path: "/tm/boards/{boardId}/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/tm/boards/{boardId}/custom-fields/{fieldId}" },
    transferToGlobal: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/transfer-to-task-manager" },
    transferToProject: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/transfer-to-project" },
    transferToBoard: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/transfer-to-board" },
    createOption: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  funnelFields: {
    create: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields" },
    update: { method: "PUT", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}" },
    move: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/move" },
    createOption: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  // Pulled forward from Phase 4: funnel names must resolve for the funnel scope above.
  funnels: {
    list: { method: "GET", path: "/crm/funnels" },
  },
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/contract.test.ts tests/operations.test.ts tests/spec.test.ts`
Expected: PASS; `registered + deferred = 157`.

- [ ] **Step 4: Commit (after go-ahead)**

```bash
git add src/operations.ts tests/contract.test.ts tests/operations.test.ts
git commit -m "feat(operations): register the custom-field operations and the funnel list"
```

---

### Task 5: Types, constants, `CustomFieldsApi`, `FunnelsApi`, task and project field reads

The typed client layer for custom fields. `CustomFieldsApi` has one method per operation class and picks the route group by `scope.kind`; the board scope is derived from the board's tasks (see the facts at the top).

**Files:**
- Modify: `src/api/constants.ts`, `src/api/types.ts`
- Create: `src/api/custom-fields.ts`, `src/api/crm/funnels.ts`
- Modify: `src/api/tasks.ts` (`getFields`, `sampleBoardFields`), `src/api/projects.ts` (`customFields` on `Project`), `src/client.ts`
- Create: `tests/api/custom-fields.test.ts`, `tests/api/crm/funnels.test.ts`
- Modify: `tests/api/tasks.test.ts`, `tests/api/projects.test.ts`, `tests/tools/projects.test.ts` (fixtures gain `customFields: []`), `tests/client.test.ts`

**Interfaces:**
- Produces (constants): `fieldTypes`, `fieldScopes`, `transferTargetKinds`, `optionColors`, `numberFormats`, `booleanStyles`.
- Produces (types): `FieldType`, `OptionColor`, `NumberFormat`, `BooleanStyle`, `NumberFieldConfig`, `BooleanFieldConfig`, `FieldConfig`, `CustomFieldOption`, `CustomField`, `NewCustomField`, `CustomFieldUpdate`, `NewFieldOption`, `FieldScope`, `TransferTarget`, `Placement`, `Funnel`, `BoardFieldSample`; `Project.customFields: CustomField[]`.
- Produces (client): `client.customFields: CustomFieldsApi` with `list(scope)`, `create({ scope, field })`, `update({ scope, fieldId, update })`, `remove({ scope, fieldId })`, `transfer({ scope, fieldId, target })`, `move({ funnelId, fieldId, placement })`, `createOption({ scope, fieldId, option })`, `updateOption({ scope, fieldId, optionId, option })`, `removeOption({ scope, fieldId, optionId })`, `moveOption({ scope, fieldId, optionId, placement })`; `client.crm.funnels.list(): Promise<Funnel[]>`; `client.tasks.getFields(taskId): Promise<CustomField[]>`; `client.tasks.sampleBoardFields(boardId): Promise<BoardFieldSample | null>`; `toCustomField`, `toFieldOption` exported from `src/api/custom-fields.ts`.

- [ ] **Step 1: Constants and types**

Append to `src/api/constants.ts`:

```ts
// Custom fields. The vocabulary is the spec's CustomField schema and the option request bodies.
export const fieldTypes = ["text", "number", "boolean", "datetime", "select", "multiselect", "member", "contact", "link", "approval"] as const;
export const fieldScopes = ["global", "project", "board", "funnel"] as const;
// A funnel's fields stay in their funnel; the other three scopes can send a field to each other.
export const transferTargetKinds = ["global", "project", "board"] as const;
// The 13 names every request body accepts. The CustomFieldOption schema lists 12 slightly
// different ones (dark_green instead of turquoise and yellow); FOLLOWUPS records which the API honours.
export const optionColors = ["blue", "light_blue", "dark_purple", "purple", "dark_pink", "pink", "light_pink", "red", "turquoise", "green", "light_green", "dark_yellow", "yellow"] as const;
export const numberFormats = ["number", "currency", "percent"] as const;
export const booleanStyles = ["radio", "checkbox"] as const;
```

Append to `src/api/types.ts` (and extend the `import type` from `./constants.js` with `booleanStyles, fieldTypes, numberFormats, optionColors`):

```ts
export type FieldType = (typeof fieldTypes)[number];
export type OptionColor = (typeof optionColors)[number];
export type NumberFormat = (typeof numberFormats)[number];
export type BooleanStyle = (typeof booleanStyles)[number];

/** A number field's settings as the API spells them; `currency` is a WEEEK currency id (1–10; GET /crm/currencies names them in Phase 4). */
export interface NumberFieldConfig { type: NumberFormat; precision: number | null; currency?: number; }
export interface BooleanFieldConfig { type: BooleanStyle; }
/** Only number and boolean fields carry settings; the two are told apart by `type`. */
export type FieldConfig = NumberFieldConfig | BooleanFieldConfig;

export interface CustomFieldOption { id: string; name: string; color: string; }
export interface CustomField {
  id: string;
  name: string;
  /** null for a type this server does not know; the value is still shown. */
  type: FieldType | null;
  config: FieldConfig | null;
  /** Only select and multiselect fields have any. */
  options: CustomFieldOption[];
}
export interface NewCustomField { name: string; type: FieldType; config?: FieldConfig; }
/** PUT takes either or both; the type cannot change. */
export interface CustomFieldUpdate { name?: string; config?: FieldConfig; }
/** PUT on an option replaces both, so an update sends both too. */
export interface NewFieldOption { name: string; color: OptionColor; }

/** Where a custom field lives. Each scope has its own routes, so the variant carries the owner's id. */
export type FieldScope =
  | { kind: "global" }
  | { kind: "project"; projectId: number }
  | { kind: "board"; boardId: number }
  | { kind: "funnel"; funnelId: string };
/** Where a global, project or board field can be sent. */
export type TransferTarget = Exclude<FieldScope, { kind: "funnel" }>;
/** The neighbour a thing is placed next to; the API takes exactly one of the two. */
export type Placement = { after: string } | { before: string };

/** The id of the funnel is an opaque string (`OLY24hy2mC7n9D9l`), not a UUID — verified live 2026-10-14. */
export interface Funnel { id: string; name: string; customFields: CustomField[]; }

/** The fields a board's tasks carry, read off one task, with the project that task sits in on that board. */
export interface BoardFieldSample { projectId: number | null; fields: CustomField[]; }
```

Add `customFields: CustomField[];` to `Project` (after `team`), with the comment `/** The project's own fields; global ones are not repeated here. */`.

- [ ] **Step 2: Write the failing API tests**

Create `tests/api/custom-fields.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { CustomFieldsApi, toCustomField } from "../../src/api/custom-fields.js";
import type { CustomField, FieldScope } from "../../src/api/types.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const base = "https://api.weeek.net/public/v1";
const fieldId = "0b1e4d7c-1111-4aaa-8bbb-000000000001";
const optionId = "0b1e4d7c-2222-4aaa-8bbb-000000000002";
const otherOptionId = "0b1e4d7c-3333-4aaa-8bbb-000000000003";
const rawField = { id: fieldId, name: "Stage", type: "select", config: null, options: [{ id: optionId, name: "Review", color: "blue" }] };
const field: CustomField = { id: fieldId, name: "Stage", type: "select", config: null, options: [{ id: optionId, name: "Review", color: "blue" }] };
const option = { id: optionId, name: "Review", color: "blue" };
const globalScope: FieldScope = { kind: "global" };
const projectScope: FieldScope = { kind: "project", projectId: 2 };
const boardScope: FieldScope = { kind: "board", boardId: 3 };
const funnelScope: FieldScope = { kind: "funnel", funnelId: "OLY24hy2mC7n9D9l" };

/** The sibling clients CustomFieldsApi composes; each test overrides what it needs. */
const siblings = (over: Record<string, unknown> = {}) => ({
  projects: { get: vi.fn(async () => ({ id: 2, customFields: [] })) },
  tasks: { sampleBoardFields: vi.fn(async () => null) },
  funnels: { list: vi.fn(async () => []) },
  ...over,
}) as any;
const api = (f: ReturnType<typeof jsonFetch>, over: Record<string, unknown> = {}) => new CustomFieldsApi(httpWith(f), siblings(over));

describe("toCustomField", () => {
  it("normalises a field with its options and a number config", () => {
    expect(toCustomField({ id: fieldId, name: "Estimate", type: "number", config: { type: "currency", precision: "2", currency: 3 }, options: [] }))
      .toEqual({ id: fieldId, name: "Estimate", type: "number", config: { type: "currency", precision: 2, currency: 3 }, options: [] });
  });
  it("nulls an unknown type and a config it cannot read, and defaults options to []", () => {
    expect(toCustomField({ id: fieldId, name: null, type: "rating", config: { type: "stars" } })).toEqual({ id: fieldId, name: "", type: null, config: null, options: [] });
  });
  it("reads a boolean config", () => {
    expect(toCustomField({ id: fieldId, type: "boolean", config: { type: "radio" } }).config).toEqual({ type: "radio" });
  });
});

describe("CustomFieldsApi.list", () => {
  it("global GETs /tm/custom-fields and reads data", async () => {
    const f = jsonFetch(200, { success: true, data: [rawField] });
    expect(await api(f).list(globalScope)).toEqual([field]);
    expect(sent(f).url).toBe(`${base}/tm/custom-fields`);
  });
  it("project reads the project's customFields through the projects client", async () => {
    const get = vi.fn(async () => ({ id: 2, customFields: [field] }));
    expect(await api(jsonFetch(200, {}), { projects: { get } }).list(projectScope)).toEqual([field]);
    expect(get).toHaveBeenCalledWith(2);
  });
  it("funnel reads the funnel's customFields from the funnel list and fails for an unknown funnel", async () => {
    const list = vi.fn(async () => [{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [field] }]);
    expect(await api(jsonFetch(200, {}), { funnels: { list } }).list(funnelScope)).toEqual([field]);
    await expect(api(jsonFetch(200, {}), { funnels: { list } }).list({ kind: "funnel", funnelId: "nope" })).rejects.toThrow(/funnel nope/);
  });
  it("board samples the board's tasks and subtracts the global and the project fields", async () => {
    const globalField = { ...field, id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Global" };
    const projectField = { ...field, id: "0b1e4d7c-5555-4aaa-8bbb-000000000005", name: "Project" };
    const f = jsonFetch(200, { success: true, data: [globalField] });
    const sampleBoardFields = vi.fn(async () => ({ projectId: 2, fields: [globalField, projectField, field] }));
    const get = vi.fn(async () => ({ id: 2, customFields: [projectField] }));
    expect(await api(f, { tasks: { sampleBoardFields }, projects: { get } }).list(boardScope)).toEqual([field]);
    expect(sampleBoardFields).toHaveBeenCalledWith(3);
  });
  it("board lists nothing when the board has no task", async () => {
    expect(await api(jsonFetch(200, { success: true, data: [rawField] })).list(boardScope)).toEqual([]);
  });
});

describe("CustomFieldsApi writes", () => {
  it.each([
    [globalScope, `${base}/tm/custom-fields`],
    [projectScope, `${base}/tm/projects/2/custom-fields`],
    [boardScope, `${base}/tm/boards/3/custom-fields`],
    [funnelScope, `${base}/crm/funnels/OLY24hy2mC7n9D9l/custom-fields`],
  ])("create POSTs to the scope's route %#", async (scope, url) => {
    const f = jsonFetch(200, { success: true, customField: rawField });
    expect(await api(f).create({ scope, field: { name: "Stage", type: "select" } })).toEqual(field);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(url);
    expect(sent(f).json()).toEqual({ name: "Stage", type: "select" });
  });

  it("create sends the config when given", async () => {
    const f = jsonFetch(200, { success: true, customField: rawField });
    await api(f).create({ scope: globalScope, field: { name: "Estimate", type: "number", config: { type: "number", precision: 1 } } });
    expect(sent(f).json()).toEqual({ name: "Estimate", type: "number", config: { type: "number", precision: 1 } });
  });

  it("update PUTs only the fields given and returns the field", async () => {
    const f = jsonFetch(200, { success: true, customField: rawField });
    expect(await api(f).update({ scope: projectScope, fieldId, update: { name: "Phase" } })).toEqual(field);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/tm/projects/2/custom-fields/${fieldId}`);
    expect(sent(f).json()).toEqual({ name: "Phase" });
  });

  it("remove DELETEs the field", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).remove({ scope: boardScope, fieldId })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/tm/boards/3/custom-fields/${fieldId}`);
  });

  it.each([
    [globalScope, { kind: "project", projectId: 9 }, `${base}/tm/custom-fields/${fieldId}/transfer-to-project`, { projectId: 9 }],
    [globalScope, { kind: "board", boardId: 8 }, `${base}/tm/custom-fields/${fieldId}/transfer-to-board`, { boardId: 8 }],
    [projectScope, { kind: "global" }, `${base}/tm/projects/2/custom-fields/${fieldId}/transfer-to-task-manager`, undefined],
    [projectScope, { kind: "project", projectId: 9 }, `${base}/tm/projects/2/custom-fields/${fieldId}/transfer-to-project`, { projectId: 9 }],
    [projectScope, { kind: "board", boardId: 8 }, `${base}/tm/projects/2/custom-fields/${fieldId}/transfer-to-board`, { boardId: 8 }],
    [boardScope, { kind: "global" }, `${base}/tm/boards/3/custom-fields/${fieldId}/transfer-to-task-manager`, undefined],
    [boardScope, { kind: "project", projectId: 9 }, `${base}/tm/boards/3/custom-fields/${fieldId}/transfer-to-project`, { projectId: 9 }],
    [boardScope, { kind: "board", boardId: 8 }, `${base}/tm/boards/3/custom-fields/${fieldId}/transfer-to-board`, { boardId: 8 }],
  ] as const)("transfer %# POSTs the right route and body", async (scope, target, url, body) => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).transfer({ scope, fieldId, target })).toEqual({ success: true });
    expect(sent(f).url).toBe(url);
    if (body === undefined) expect(sent(f).init.body).toBeUndefined();
    else expect(sent(f).json()).toEqual(body);
  });

  it("transfer refuses global→global and any funnel field before sending", async () => {
    const f = jsonFetch(200, { success: true });
    await expect(api(f).transfer({ scope: globalScope, fieldId, target: { kind: "global" } })).rejects.toThrow(/already global/);
    await expect(api(f).transfer({ scope: funnelScope, fieldId, target: { kind: "global" } })).rejects.toThrow(/funnel/);
    expect(f).not.toHaveBeenCalled();
  });

  it("move POSTs the one neighbour given", async () => {
    const f = jsonFetch(200, { success: true });
    await api(f).move({ funnelId: "OLY24hy2mC7n9D9l", fieldId, placement: { after: otherOptionId } });
    expect(sent(f).url).toBe(`${base}/crm/funnels/OLY24hy2mC7n9D9l/custom-fields/${fieldId}/move`);
    expect(sent(f).json()).toEqual({ after: otherOptionId });
  });

  it("createOption POSTs name + color and returns the option", async () => {
    const f = jsonFetch(200, { success: true, option });
    expect(await api(f).createOption({ scope: globalScope, fieldId, option: { name: "Review", color: "blue" } })).toEqual(option);
    expect(sent(f).url).toBe(`${base}/tm/custom-fields/${fieldId}/options`);
    expect(sent(f).json()).toEqual({ name: "Review", color: "blue" });
  });

  it("updateOption PUTs both fields to the option's path", async () => {
    const f = jsonFetch(200, { success: true, option });
    expect(await api(f).updateOption({ scope: funnelScope, fieldId, optionId, option: { name: "Review", color: "red" } })).toEqual(option);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/crm/funnels/OLY24hy2mC7n9D9l/custom-fields/${fieldId}/options/${optionId}`);
    expect(sent(f).json()).toEqual({ name: "Review", color: "red" });
  });

  it("removeOption DELETEs the option", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).removeOption({ scope: projectScope, fieldId, optionId })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/tm/projects/2/custom-fields/${fieldId}/options/${optionId}`);
  });

  it("moveOption POSTs before only", async () => {
    const f = jsonFetch(200, { success: true });
    await api(f).moveOption({ scope: boardScope, fieldId, optionId, placement: { before: otherOptionId } });
    expect(sent(f).url).toBe(`${base}/tm/boards/3/custom-fields/${fieldId}/options/${optionId}/move`);
    expect(sent(f).json()).toEqual({ before: otherOptionId });
  });
});
```

Create `tests/api/crm/funnels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FunnelsApi } from "../../../src/api/crm/funnels.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const rawFunnel = { id: "OLY24hy2mC7n9D9l", name: "Sales", dealsCount: 3, customFields: [{ id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Source", type: "text", options: [] }] };

describe("FunnelsApi", () => {
  it("list GETs /crm/funnels and keeps id, name and fields", async () => {
    const f = jsonFetch(200, { success: true, funnels: [rawFunnel] });
    expect(await new FunnelsApi(httpWith(f)).list()).toEqual([{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [{ id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Source", type: "text", config: null, options: [] }] }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/crm/funnels");
  });
});
```

Append to `tests/api/tasks.test.ts`:

```ts
  it("getFields reads a task's fields with their options off GET /tm/tasks/{id}", async () => {
    const rawField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", options: [{ id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" }], value: null };
    const f = jsonFetch(200, { success: true, task: { ...rawTask, customFields: [rawField] } });
    expect(await new TasksApi(httpWith(f)).getFields(78)).toEqual([{ id: rawField.id, name: "Stage", type: "select", config: null, options: rawField.options }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
  });

  it("sampleBoardFields reads one task of the board, with every task state, and the project it sits in there", async () => {
    const rawField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "text", options: [], value: "x" };
    const f = jsonFetch(200, { success: true, tasks: [{ ...rawTask, locations: [{ projectId: 9, boardId: 1 }, { projectId: 2, boardId: 3 }], customFields: [rawField] }] });
    expect(await new TasksApi(httpWith(f)).sampleBoardFields(3)).toEqual({ projectId: 2, fields: [{ id: rawField.id, name: "Stage", type: "text", config: null, options: [] }] });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks?boardId=3&perPage=1&all=1");
  });

  it("sampleBoardFields is null for a board without tasks", async () => {
    const f = jsonFetch(200, { success: true, tasks: [] });
    expect(await new TasksApi(httpWith(f)).sampleBoardFields(3)).toBeNull();
  });
```

In `tests/api/projects.test.ts` the expected `project` gains `customFields: []`, and the "defaults missing fields" expectation too. In `tests/tools/projects.test.ts` the `marketing` fixture gains `customFields: []`. In `tests/client.test.ts` add to the facade test: `expect(typeof c.customFields.list).toBe("function"); expect(typeof c.crm.funnels.list).toBe("function");`.

Run: `npx vitest run tests/api tests/client.test.ts`
Expected: FAIL — modules missing, `getFields`/`sampleBoardFields` undefined, `customFields` missing on projects.

- [ ] **Step 3: `CustomFieldsApi` and `FunnelsApi`**

Create `src/api/custom-fields.ts`:

```ts
import type { HttpClient, PathParams } from "../http.js";
import { operations, type Operation } from "../operations.js";
import { asRecord, isOneOf, pickArray } from "./responses.js";
import { booleanStyles, fieldTypes, numberFormats } from "./constants.js";
import type { ProjectsApi } from "./projects.js";
import type { TasksApi } from "./tasks.js";
import type { FunnelsApi } from "./crm/funnels.js";
import type {
  CustomField, CustomFieldOption, CustomFieldUpdate, FieldConfig, FieldScope, NewCustomField, NewFieldOption,
  NumberFieldConfig, Placement, SuccessResponse, TransferTarget,
} from "./types.js";

export interface FieldRef { scope: FieldScope; fieldId: string; }
export interface CreateFieldOptions { scope: FieldScope; field: NewCustomField; }
export interface UpdateFieldOptions extends FieldRef { update: CustomFieldUpdate; }
export interface TransferFieldOptions extends FieldRef { target: TransferTarget; }
export interface MoveFieldOptions { funnelId: string; fieldId: string; placement: Placement; }
export interface CreateOptionOptions extends FieldRef { option: NewFieldOption; }
export interface OptionRef extends FieldRef { optionId: string; }
export interface UpdateOptionOptions extends OptionRef { option: NewFieldOption; }
export interface MoveOptionOptions extends OptionRef { placement: Placement; }

/** The clients the board and funnel scopes are read through; the API has no list of its own for them. */
export interface FieldSources { projects: Pick<ProjectsApi, "get">; tasks: Pick<TasksApi, "sampleBoardFields">; funnels: Pick<FunnelsApi, "list">; }

export const globalScope: FieldScope = { kind: "global" };

export function toFieldOption(raw: unknown): CustomFieldOption {
  const r = asRecord(raw);
  return { id: String(r.id ?? ""), name: String(r.name ?? ""), color: String(r.color ?? "") };
}

function toFieldConfig(raw: unknown): FieldConfig | null {
  const r = asRecord(raw);
  if (isOneOf(numberFormats, r.type)) {
    const config: NumberFieldConfig = { type: r.type, precision: r.precision == null ? null : Number(r.precision) };
    if (r.currency != null) config.currency = Number(r.currency);
    return config;
  }
  if (isOneOf(booleanStyles, r.type)) return { type: r.type };
  return null;
}

export function toCustomField(raw: unknown): CustomField {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    type: isOneOf(fieldTypes, r.type) ? r.type : null,
    config: toFieldConfig(r.config),
    // Never pickArray here: a task's field sits beside other arrays, and the fallback would pick one of them.
    options: Array.isArray(r.options) ? r.options.map(toFieldOption) : [],
  };
}

// The route members every scope has. The four groups in src/operations.ts share these names on
// purpose; typed as Operation, not as one group's literal paths, so every group fits.
type ScopedRoutes = Record<"create" | "update" | "remove" | "createOption" | "updateOption" | "removeOption" | "moveOption", Operation>;
type TransferRoutes = Record<"transferToGlobal" | "transferToProject" | "transferToBoard", Operation>;
interface ScopeRouting { routes: ScopedRoutes; params: PathParams; }

function routingOf(scope: FieldScope): ScopeRouting {
  switch (scope.kind) {
    case "global": return { routes: operations.globalFields, params: {} };
    case "project": return { routes: operations.projectFields, params: { projectId: scope.projectId } };
    case "board": return { routes: operations.boardFields, params: { boardId: scope.boardId } };
    case "funnel": return { routes: operations.funnelFields, params: { funnelId: scope.funnelId } };
    default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
  }
}

interface TransferRoute { operation: Operation; body?: Record<string, number>; }

function scopedTransfer(routes: TransferRoutes, target: TransferTarget): TransferRoute {
  switch (target.kind) {
    case "global": return { operation: routes.transferToGlobal };
    case "project": return { operation: routes.transferToProject, body: { projectId: target.projectId } };
    case "board": return { operation: routes.transferToBoard, body: { boardId: target.boardId } };
    default: { const _exhaustive: never = target; throw new Error(`unhandled transfer target ${String(_exhaustive)}`); }
  }
}

function transferRoute(scope: FieldScope, target: TransferTarget): TransferRoute {
  switch (scope.kind) {
    case "funnel": throw new Error("a funnel's custom fields stay in their funnel; move reorders them instead");
    case "global":
      switch (target.kind) {
        case "global": throw new Error("the field is already global");
        case "project": return { operation: operations.globalFields.transferToProject, body: { projectId: target.projectId } };
        case "board": return { operation: operations.globalFields.transferToBoard, body: { boardId: target.boardId } };
        default: { const _exhaustive: never = target; throw new Error(`unhandled transfer target ${String(_exhaustive)}`); }
      }
    case "project": return scopedTransfer(operations.projectFields, target);
    case "board": return scopedTransfer(operations.boardFields, target);
    default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
  }
}

export class CustomFieldsApi {
  constructor(private http: HttpClient, private sources: FieldSources) {}

  /**
   * The fields of one scope. Global, project and funnel fields are listed by the API; a board's
   * are not listed anywhere, so they are read off one of the board's tasks (every task carries
   * every field that applies to it) minus the global and the project fields that task inherits.
   * A board without tasks lists nothing.
   */
  async list(scope: FieldScope): Promise<CustomField[]> {
    switch (scope.kind) {
      case "global": {
        const json = await this.http.execute<Record<string, unknown>>(operations.globalFields.list);
        return pickArray(json, "data").map(toCustomField);
      }
      case "project": return (await this.sources.projects.get(scope.projectId)).customFields;
      case "funnel": {
        const funnel = (await this.sources.funnels.list()).find((candidate) => candidate.id === scope.funnelId);
        if (!funnel) throw new Error(`funnel ${scope.funnelId} not found`);
        return funnel.customFields;
      }
      case "board": {
        const sample = await this.sources.tasks.sampleBoardFields(scope.boardId);
        if (sample === null) return [];
        const projectFields = sample.projectId === null ? [] : await this.list({ kind: "project", projectId: sample.projectId });
        const inherited = new Set([...(await this.list(globalScope)), ...projectFields].map((field) => field.id));
        return sample.fields.filter((field) => !inherited.has(field.id));
      }
      default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
    }
  }

  async create({ scope, field }: CreateFieldOptions): Promise<CustomField> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ customField: unknown }>(routes.create, { params, body: field });
    return toCustomField(json.customField);
  }

  async update({ scope, fieldId, update }: UpdateFieldOptions): Promise<CustomField> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ customField: unknown }>(routes.update, { params: { ...params, fieldId }, body: update });
    return toCustomField(json.customField);
  }

  async remove({ scope, fieldId }: FieldRef): Promise<SuccessResponse> {
    const { routes, params } = routingOf(scope);
    return this.http.execute<SuccessResponse>(routes.remove, { params: { ...params, fieldId } });
  }

  async transfer({ scope, fieldId, target }: TransferFieldOptions): Promise<SuccessResponse> {
    const { operation, body } = transferRoute(scope, target);
    return this.http.execute<SuccessResponse>(operation, { params: { ...routingOf(scope).params, fieldId }, body });
  }

  /** Only funnel fields have an order the API exposes. */
  async move({ funnelId, fieldId, placement }: MoveFieldOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(operations.funnelFields.move, { params: { funnelId, fieldId }, body: placement });
  }

  async createOption({ scope, fieldId, option }: CreateOptionOptions): Promise<CustomFieldOption> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ option: unknown }>(routes.createOption, { params: { ...params, fieldId }, body: option });
    return toFieldOption(json.option);
  }

  async updateOption({ scope, fieldId, optionId, option }: UpdateOptionOptions): Promise<CustomFieldOption> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ option: unknown }>(routes.updateOption, { params: { ...params, fieldId, optionId }, body: option });
    return toFieldOption(json.option);
  }

  async removeOption({ scope, fieldId, optionId }: OptionRef): Promise<SuccessResponse> {
    const { routes, params } = routingOf(scope);
    return this.http.execute<SuccessResponse>(routes.removeOption, { params: { ...params, fieldId, optionId } });
  }

  async moveOption({ scope, fieldId, optionId, placement }: MoveOptionOptions): Promise<SuccessResponse> {
    const { routes, params } = routingOf(scope);
    return this.http.execute<SuccessResponse>(routes.moveOption, { params: { ...params, fieldId, optionId }, body: placement });
  }
}
```

Create `src/api/crm/funnels.ts`:

```ts
import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, pickArray } from "../responses.js";
import { toCustomField } from "../custom-fields.js";
import type { Funnel } from "../types.js";

export function toFunnel(raw: unknown): Funnel {
  const r = asRecord(raw);
  return { id: String(r.id ?? ""), name: String(r.name ?? ""), customFields: Array.isArray(r.customFields) ? r.customFields.map(toCustomField) : [] };
}

/** Phase 3 needs only the list (funnel names and their fields); Phase 4 adds the rest. */
export class FunnelsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Funnel[]> {
    const json = await this.http.execute<Record<string, unknown>>(operations.funnels.list);
    return pickArray(json, "funnels").map(toFunnel);
  }
}
```

- [ ] **Step 4: Task and project reads, client wiring**

`src/api/tasks.ts` — import `toCustomField` from `./custom-fields.js` and `BoardFieldSample, CustomField` from `./types.js`; add to `TasksApi`:

```ts
  /** A task's fields with their options — what a value by name is resolved against. */
  async getFields(taskId: number): Promise<CustomField[]> {
    const json = await this.http.execute<{ task: unknown }>(ops.get, { params: { taskId } });
    return fieldsOf(json.task);
  }

  /**
   * One task of the board, with every task state, as the only readable source of a board's fields
   * (see CustomFieldsApi.list). Null when the board has no task at all.
   */
  async sampleBoardFields(boardId: number): Promise<BoardFieldSample | null> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query: { boardId, perPage: 1, all: 1 } });
    const [firstTask] = pickArray(json, "tasks");
    if (firstTask === undefined) return null;
    const onThisBoard = toTask(firstTask).locations.find((location) => location.boardId === boardId);
    return { projectId: onThisBoard?.projectId ?? null, fields: fieldsOf(firstTask) };
  }
```

and, beside `toTask`, the one reader of a task's raw field list:

```ts
function fieldsOf(rawTask: unknown): CustomField[] {
  const fields = asRecord(rawTask).customFields;
  return Array.isArray(fields) ? fields.map(toCustomField) : [];
}
```

`src/api/projects.ts` — in `toProject` add `customFields: Array.isArray(r.customFields) ? r.customFields.map(toCustomField) : [],` (import `toCustomField` from `./custom-fields.js`).

`src/client.ts`:

```ts
import { CustomFieldsApi } from "./api/custom-fields.js";
import { FunnelsApi } from "./api/crm/funnels.js";
…
  readonly customFields: CustomFieldsApi;
  /** CRM clients; Phase 3 carries only what custom fields need. */
  readonly crm: { funnels: FunnelsApi };
…
    this.crm = { funnels: new FunnelsApi(http) };
    this.customFields = new CustomFieldsApi(http, { projects: this.projects, tasks: this.tasks, funnels: this.crm.funnels });
```

(Assign `this.crm` after `this.tasks` and `this.projects`, since `customFields` reads them.)

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm test`
Expected: green. If `routingOf`'s `operations.globalFields` is rejected for `ScopedRoutes`, the group is missing one of the seven shared member names — fix the registry (Task 4), never widen the type.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/api src/client.ts tests/api tests/client.test.ts tests/tools/projects.test.ts
git commit -m "feat(api): custom fields client for the four scopes, funnel list, task field reads"
```

---

### Task 6: Resolver — entry-typed kinds, `list`/`find`, the opaque shape, `funnel` and `customField` kinds

The resolver keeps resolving names to ids, and now also hands back the entry it matched: field tools need options and settings. The funnel's id has no pattern, so the `opaque` shape never passes a value through — it is recognised only against the loaded list. This task also closes the resolver bullets of FOLLOWUPS #22.

**Files:**
- Modify: `src/resolver.ts` (rewrite), `tests/resolver.test.ts`, `docs/FOLLOWUPS.md`

**Interfaces:**
- Produces: `ResolveScope { projectId?: number; boardId?: number; fieldScope?: FieldScope }`; `KindName` adds `"funnel" | "customField"`; `EntryOf<K>`; `Resolver.list({ kind, scope? })`, `Resolver.find({ kind, value, scope? })`, `Resolver.resolve(...)` (unchanged signature), `Resolver.forget(...)` (unchanged), `Resolver.pickUniqueEntry(label, query, entries)` (static, name only; replaces `pickUnique`) and `Resolver.pickEntry(label, query, entries)` (static; id or name — what `find` and Task 7's `pickField`/`pickOption` use).
- Consumes: `client.crm.funnels.list()`, `client.customFields.list(scope)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/resolver.test.ts`, inside `describe("Resolver.resolve", …)`:

```ts
  it("resolves a funnel by name, or by its opaque id, only against the loaded list", async () => {
    const list = vi.fn(async () => [{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [] }]);
    const r = new Resolver(clientWith({ crm: { funnels: { list } } }), freshCache());
    expect(await r.resolve({ kind: "funnel", value: "sales" })).toBe("OLY24hy2mC7n9D9l");
    expect(await r.resolve({ kind: "funnel", value: "OLY24hy2mC7n9D9l" })).toBe("OLY24hy2mC7n9D9l");
    await expect(r.resolve({ kind: "funnel", value: "ZZZ24hy2mC7n9D9l" })).rejects.toThrow(/could not resolve funnel "ZZZ24hy2mC7n9D9l"; candidates: none/);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("resolves a custom field inside its scope, caching each scope apart", async () => {
    const field = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Estimate", type: "number", config: null, options: [] };
    const list = vi.fn(async (scope: { kind: string }) => (scope.kind === "global" ? [field] : []));
    const r = new Resolver(clientWith({ customFields: { list } }), freshCache());
    expect(await r.resolve({ kind: "customField", value: "estimate" })).toBe(field.id);
    await expect(r.resolve({ kind: "customField", value: "estimate", scope: { fieldScope: { kind: "project", projectId: 2 } } })).rejects.toThrow(/could not resolve custom field "estimate"/);
    expect(list).toHaveBeenNthCalledWith(1, { kind: "global" });
    expect(list).toHaveBeenNthCalledWith(2, { kind: "project", projectId: 2 });
  });

  it("find returns the matched entry itself, for a name and for an id", async () => {
    const field = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [{ id: "o1", name: "Review", color: "blue" }] };
    const r = new Resolver(clientWith({ customFields: { list: async () => [field] } }), freshCache());
    expect(await r.find({ kind: "customField", value: "stage" })).toEqual(field);
    expect(await r.find({ kind: "customField", value: field.id })).toEqual(field);
    await expect(r.find({ kind: "customField", value: "0b1e4d7c-9999-4aaa-8bbb-000000000009" })).rejects.toThrow(/could not resolve custom field/);
  });

  it("list returns the cached entries of a scope", async () => {
    const list = vi.fn(async () => [{ id: 1, name: "Marketing" }]);
    const r = new Resolver(clientWith({ projects: { list } }), freshCache());
    expect(await r.list({ kind: "project" })).toEqual([{ id: 1, name: "Marketing" }]);
    await r.list({ kind: "project" });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("forgetting a custom field drops every field scope", async () => {
    const list = vi.fn(async () => []);
    const r = new Resolver(clientWith({ customFields: { list } }), freshCache());
    await r.list({ kind: "customField" });
    await r.list({ kind: "customField", scope: { fieldScope: { kind: "board", boardId: 3 } } });
    r.forget({ kind: "customField" });
    await r.list({ kind: "customField" });
    await r.list({ kind: "customField", scope: { fieldScope: { kind: "board", boardId: 3 } } });
    expect(list).toHaveBeenCalledTimes(4);
  });

  it("forgetting a board in a project also drops the per-board column lists", async () => {
    const boardsList = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const columnsList = vi.fn(async (_bid: number) => [{ id: 100, name: "Done" }]);
    const r = new Resolver(clientWith({ boards: { list: boardsList }, columns: { list: columnsList } }), freshCache());
    await r.resolve({ kind: "column", value: "Done", scope: { boardId: 10 } });
    r.forget({ kind: "board", scope: { projectId: 1 } });
    await r.resolve({ kind: "column", value: "Done", scope: { boardId: 10 } });
    expect(columnsList).toHaveBeenCalledTimes(2);
  });
```

Run: `npx vitest run tests/resolver.test.ts`
Expected: FAIL — unknown kinds, `find`/`list` missing, board forget leaves `board-columns:10`.

- [ ] **Step 2: Rewrite the resolver**

Replace `src/resolver.ts` with:

```ts
import type { WeeekClient } from "./client.js";
import type { NameCache } from "./cache.js";
import type { CustomField, FieldScope, Funnel } from "./api/types.js";
import { globalScope } from "./api/custom-fields.js";
import { ResolutionError, type Candidate } from "./errors.js";

/**
 * How an id looks on the wire. An opaque id (a funnel's "OLY24hy2mC7n9D9l") has no pattern a
 * name could not also have, so it is only ever recognised against the loaded collection.
 */
export type IdShape = "integer" | "uuid" | "opaque";
export type LoadStrategy = "list" | "search";

// A server-side search is never paged in full: this many candidates is plenty to pick one
// exact match from or to show as suggestions.
const searchPageSize = 50;

export interface Named<Id extends number | string> { id: Id; name: string; }
/** The ids a load may depend on; each kind reads the ones it needs and ignores the rest. */
export interface ResolveScope { projectId?: number; boardId?: number; fieldScope?: FieldScope; }

/** What the resolver needs to know about one kind of named thing, and what its load returns. */
interface KindBase<Entry extends Named<number | string>> {
  /** The word used in error messages — the tool parameter's name, not the API's. */
  label: string;
  /** "list" loads the whole (small) collection once; "search" asks the API for the query and caches per query. */
  strategy: LoadStrategy;
  /** Cache prefix; must include every scope id the load depends on. A search kind caches under `${prefix}:${query}`. */
  cacheKey(scope: ResolveScope): string;
  load(client: WeeekClient, scope: ResolveScope, query: string): Promise<Entry[]>;
  /**
   * Every cache prefix a write to this kind makes stale. Never throws: a missing scope widens
   * to the bare prefixes (drop more, re-read once) instead of failing the write that called it.
   */
  forgetPrefixes(scope: ResolveScope): string[];
}
// The shape names the id type, so a kind cannot declare uuid ids and load numeric ones.
interface IntegerKind<Entry extends Named<number> = Named<number>> extends KindBase<Entry> { shape: "integer"; }
interface UuidKind<Entry extends Named<string> = Named<string>> extends KindBase<Entry> { shape: "uuid"; }
interface OpaqueKind<Entry extends Named<string> = Named<string>> extends KindBase<Entry> { shape: "opaque"; }
type Kind = IntegerKind | UuidKind | OpaqueKind;

interface KindTable {
  project: IntegerKind;
  board: IntegerKind;
  column: IntegerKind;
  member: UuidKind;
  tag: IntegerKind;
  portfolio: IntegerKind;
  funnel: OpaqueKind<Funnel>;
  customField: UuidKind<CustomField>;
}
export type KindName = keyof KindTable;
/** The entry type a kind's load returns — what `find` and `list` hand back. */
export type EntryOf<K extends KindName> = Awaited<ReturnType<KindTable[K]["load"]>>[number];
type IdOf<K extends KindName> = EntryOf<K>["id"];

export interface ResolveOptions<K extends KindName> {
  kind: K;
  value: string | number;
  scope?: ResolveScope;
}
export interface ListOptions<K extends KindName> { kind: K; scope?: ResolveScope; }
export interface ForgetOptions { kind: KindName; scope?: ResolveScope; }

const INTEGER_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phrased for the tool caller, who passes a name or an id, not the resolver's scope fields.
const boardScopeNeed = "a project (name or id)";
const columnScopeNeed = "a board or a project (name or id)";

function requireScope<T>(value: T | undefined, label: string, needed: string): T {
  if (value === undefined) throw new Error(`resolving a ${label} by name needs ${needed}`);
  return value;
}

function fieldScopeKey(scope: FieldScope): string {
  switch (scope.kind) {
    case "global": return "global";
    case "project": return `project:${scope.projectId}`;
    case "board": return `board:${scope.boardId}`;
    case "funnel": return `funnel:${scope.funnelId}`;
    default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
  }
}

const kinds: KindTable = {
  project: {
    shape: "integer", label: "project", strategy: "list",
    cacheKey: () => "projects",
    forgetPrefixes: () => ["projects"],
    load: (client) => client.projects.list(),
  },
  board: {
    shape: "integer", label: "board", strategy: "list",
    cacheKey: (scope) => `boards:${requireScope(scope.projectId, "board", boardScopeNeed)}`,
    // The project-wide column aggregate is built from the boards, and the per-board lists cannot
    // be mapped to a project without a fetch, so a board write dirties all three families.
    forgetPrefixes: ({ projectId }) => projectId !== undefined
      ? [`boards:${projectId}`, `columns:${projectId}`, "board-columns"]
      : ["boards", "columns", "board-columns"],
    load: (client, scope) => client.boards.list(requireScope(scope.projectId, "board", boardScopeNeed)),
  },
  column: {
    shape: "integer", label: "column", strategy: "list",
    cacheKey: (scope) => scope.boardId !== undefined
      ? `board-columns:${scope.boardId}`
      : `columns:${requireScope(scope.projectId, "column", columnScopeNeed)}`,
    // A boardId cannot be mapped to its project without a fetch, so both families go entirely.
    forgetPrefixes: () => ["board-columns", "columns"],
    load: async (client, scope) => {
      if (scope.boardId !== undefined) return client.columns.list(scope.boardId);
      const boards = await client.boards.list(requireScope(scope.projectId, "column", columnScopeNeed));
      const all: Named<number>[] = [];
      for (const board of boards) all.push(...(await client.columns.list(board.id)));
      return all;
    },
  },
  member: {
    shape: "uuid", label: "member", strategy: "list",
    cacheKey: () => "members",
    forgetPrefixes: () => ["members"],
    load: (client) => client.workspace.listMembers(),
  },
  tag: {
    shape: "integer", label: "tag", strategy: "list",
    cacheKey: () => "tags",
    forgetPrefixes: () => ["tags"],
    // Tags carry `title`, not `name`; the resolver only ever matches on `name`.
    load: async (client) => (await client.tags.list()).map((tag) => ({ id: tag.id, name: tag.title })),
  },
  portfolio: {
    shape: "integer", label: "portfolio", strategy: "search",
    cacheKey: () => "portfolios",
    forgetPrefixes: () => ["portfolios"],
    // Only the first searchPageSize matches are considered, so an exact match beyond them is reported as not found, with candidates.
    load: async (client, _scope, query) => (await client.portfolios.list({ search: query, limit: searchPageSize })).portfolios,
  },
  funnel: {
    shape: "opaque", label: "funnel", strategy: "list",
    cacheKey: () => "funnels",
    forgetPrefixes: () => ["funnels"],
    load: (client) => client.crm.funnels.list(),
  },
  customField: {
    shape: "uuid", label: "custom field", strategy: "list",
    cacheKey: (scope) => `fields:${fieldScopeKey(scope.fieldScope ?? globalScope)}`,
    // A board's list is derived from the global and the project lists, so one field write dirties every scope.
    forgetPrefixes: () => ["fields"],
    load: (client, scope) => client.customFields.list(scope.fieldScope ?? globalScope),
  },
};

export class Resolver {
  constructor(private client: WeeekClient, private cache: NameCache) {}

  /** Exactly one case-insensitive exact match wins; otherwise the duplicates, or up to five substring matches, are the candidates. */
  static pickUniqueEntry<Entry extends Named<number | string>>(label: string, query: string, entries: Entry[]): Entry {
    const q = query.trim().toLowerCase();
    const exact = entries.filter((entry) => entry.name.trim().toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const candidates: Candidate[] = (exact.length > 1
      ? exact
      : entries.filter((entry) => entry.name.trim().toLowerCase().includes(q)).slice(0, 5)
    ).map((entry) => ({ id: entry.id, name: entry.name }));
    throw new ResolutionError(label, query, candidates);
  }

  /** The entry an id or a name denotes: an id matches exactly one entry; anything else is matched as a name. */
  static pickEntry<Entry extends Named<number | string>>(label: string, query: string, entries: Entry[]): Entry {
    const trimmed = query.trim();
    return entries.find((entry) => String(entry.id) === trimmed) ?? Resolver.pickUniqueEntry(label, trimmed, entries);
  }

  /** The cached entries of a list kind in a scope (a search kind would get the empty query). */
  async list<K extends KindName>({ kind, scope = {} }: ListOptions<K>): Promise<EntryOf<K>[]> {
    return this.load(kind, scope, "");
  }

  /** The entry a name or an id denotes — the whole thing, for callers that need more than the id. Always loads. */
  async find<K extends KindName>({ kind, value, scope = {} }: ResolveOptions<K>): Promise<EntryOf<K>> {
    const query = String(value).trim();
    const entries = await this.load(kind, scope, query);
    return Resolver.pickEntry(kinds[kind].label, query, entries);
  }

  /** The id a name or an id denotes. An id of the kind's shape passes through without a load. */
  async resolve<K extends KindName>({ kind, value, scope = {} }: ResolveOptions<K>): Promise<IdOf<K>> {
    const id = Resolver.asId(kinds[kind].shape, value);
    // asId returns the id type the shape declares, and the table ties each kind's shape to its entry's id.
    if (id !== null) return id as IdOf<K>;
    return (await this.find({ kind, value, scope })).id;
  }

  /**
   * Called by a write tool for every kind its write dirtied, so the next name lookup re-reads.
   * Drops every cache family the kind owns (a column drops both its families; a board also drops
   * its project's column aggregate; a search kind drops every cached query). Never throws.
   */
  forget({ kind, scope = {} }: ForgetOptions): void {
    for (const prefix of kinds[kind].forgetPrefixes(scope)) this.cache.invalidatePrefix(prefix);
  }

  private async load<K extends KindName>(kind: K, scope: ResolveScope, query: string): Promise<EntryOf<K>[]> {
    const kindDefinition: Kind = kinds[kind];
    const key = Resolver.cacheKeyFor(kindDefinition, scope, query);
    const entries = await this.cache.get<Array<Named<number | string>>>(key, () => kindDefinition.load(this.client, scope, query));
    // The cache is untyped (FOLLOWUPS #3); the kind that loaded a key is the only one that reads it.
    return entries as unknown as EntryOf<K>[];
  }

  private static cacheKeyFor(kindDefinition: Kind, scope: ResolveScope, query: string): string {
    const prefix = kindDefinition.cacheKey(scope);
    if (kindDefinition.strategy === "list") return prefix;
    if (kindDefinition.strategy === "search") return `${prefix}:${query.toLowerCase()}`;
    const _exhaustive: never = kindDefinition.strategy;
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
    if (shape === "opaque") return null;
    const _exhaustive: never = shape;
    throw new Error(`unhandled id shape ${String(_exhaustive)}`);
  }
}
```

If `const kindDefinition: Kind = kinds[kind]` is rejected because `OpaqueKind<Funnel>` is not assignable to `OpaqueKind<Named<string>>`, the cause is `load`'s parameter position; keep the table as is and type `kindDefinition` as `KindBase<Named<number | string>> & { shape: IdShape }` instead — never widen `KindTable`.

- [ ] **Step 3: Run the tests**

Run: `npm run typecheck && npx vitest run tests/resolver.test.ts tests/tools`
Expected: green; the existing passthrough, scope and forget tests still hold.

- [ ] **Step 4: FOLLOWUPS and commit (after go-ahead)**

Strike item 22's resolver bullets: casts (one documented cast remains, at the untyped cache), the constants-beside-types note (`idShapes`/`loadStrategies` were type-only and are now plain unions), `definition` → `kindDefinition`, the stale `board-columns` after a scoped board forget. Add one line to item 21 or as a new paragraph in item 23 (Task 9 creates it): "funnel ids are opaque strings (live, 2026-10-14); the resolver gained the `opaque` shape; Phase 4 should expect the same for statuses and deals".

```bash
git add src/resolver.ts tests/resolver.test.ts docs/FOLLOWUPS.md
git commit -m "feat(resolver): entry-typed kinds with list and find, opaque funnel ids, custom-field scopes"
```

---

### Task 7: The `custom-fields` toolset — ten tools

The tools are the I/O boundary that narrows `scope` into one `FieldScope` variant; everything below them is typed. Every write forgets the `fields` cache family so a field created by one call resolves by name in the next.

**Files:**
- Create: `src/tools/field-refs.ts`, `src/tools/custom-fields.ts`, `tests/tools/field-refs.test.ts`, `tests/tools/custom-fields.test.ts`
- Modify: `src/toolsets/constants.ts`, `src/toolsets/register.ts`, `tests/helpers/tool-names.ts`, `tests/toolsets/register.test.ts`

**Interfaces:**
- Produces (`src/tools/field-refs.ts`): `fieldScopeShape`, `FieldScopeArgs`, `parseFieldScope(resolver, args): Promise<FieldScope>`, `transferShape`, `parseTransferTarget(resolver, args): Promise<TransferTarget>`, `fieldConfigShape`, `buildFieldConfig({ type, args, current? }): FieldConfig | undefined`, `pickField(fields, value): CustomField`, `pickOption(field, value): CustomFieldOption`, `placementShape`, `parsePlacement(args, idOf): Placement`. Task 8 uses `pickField` and `pickOption`.
- Produces: `registerCustomFieldTools(ctx)`; `toolsetNames` gains `"custom-fields"`; `customFieldToolNames` in the test helper.
- Consumes: `Resolver.find/list/forget/resolve`, `Resolver.pickEntry` (Task 6), `client.customFields.*` (Task 5).

- [ ] **Step 1: Write the failing tests for the reference helpers**

Create `tests/tools/field-refs.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { buildFieldConfig, parseFieldScope, parsePlacement, parseTransferTarget, pickField, pickOption } from "../../src/tools/field-refs.js";
import type { CustomField } from "../../src/client.js";

const review = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" };
const done = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Done", color: "green" };
const stage: CustomField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [review, done] };
const estimate: CustomField = { id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Estimate", type: "number", config: { type: "number", precision: 0 }, options: [] };
const resolver = () => new Resolver({
  projects: { list: vi.fn(async () => [{ id: 1, name: "Marketing" }]) },
  boards: { list: vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]) },
  crm: { funnels: { list: vi.fn(async () => [{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [] }]) } },
} as any, new NameCache(100_000, () => 0));

describe("parseFieldScope", () => {
  it("turns each scope and its owner into one FieldScope", async () => {
    const r = resolver();
    expect(await parseFieldScope(r, { scope: "global" })).toEqual({ kind: "global" });
    expect(await parseFieldScope(r, { scope: "project", project: "marketing" })).toEqual({ kind: "project", projectId: 1 });
    expect(await parseFieldScope(r, { scope: "board", board: "main", project: 1 })).toEqual({ kind: "board", boardId: 10 });
    expect(await parseFieldScope(r, { scope: "board", board: 10 })).toEqual({ kind: "board", boardId: 10 });
    expect(await parseFieldScope(r, { scope: "funnel", funnel: "sales" })).toEqual({ kind: "funnel", funnelId: "OLY24hy2mC7n9D9l" });
  });
  it("names the missing owner", async () => {
    await expect(parseFieldScope(resolver(), { scope: "project" })).rejects.toThrow(/scope "project" needs `project` \(name or id\)/);
    await expect(parseFieldScope(resolver(), { scope: "board", board: "Main" })).rejects.toThrow(/needs a project \(name or id\)/);
    await expect(parseFieldScope(resolver(), { scope: "funnel" })).rejects.toThrow(/scope "funnel" needs `funnel`/);
  });
});

describe("parseTransferTarget", () => {
  it("resolves the target owner", async () => {
    const r = resolver();
    expect(await parseTransferTarget(r, { to: "global" })).toEqual({ kind: "global" });
    expect(await parseTransferTarget(r, { to: "project", to_project: "Marketing" })).toEqual({ kind: "project", projectId: 1 });
    expect(await parseTransferTarget(r, { to: "board", to_board: "Main", to_project: "Marketing" })).toEqual({ kind: "board", boardId: 10 });
    await expect(parseTransferTarget(r, { to: "board" })).rejects.toThrow(/needs `to_board`/);
  });
});

describe("buildFieldConfig", () => {
  it("builds a number config with defaults, merging over the current one", () => {
    expect(buildFieldConfig({ type: "number", args: { precision: 2 } })).toEqual({ type: "number", precision: 2 });
    expect(buildFieldConfig({ type: "number", args: { number_format: "currency", currency_id: 3 } })).toEqual({ type: "currency", precision: 0, currency: 3 });
    expect(buildFieldConfig({ type: "number", args: { precision: 1 }, current: { type: "percent", precision: 0 } })).toEqual({ type: "percent", precision: 1 });
    expect(buildFieldConfig({ type: "number", args: {} })).toBeUndefined();
  });
  it("builds a boolean config only when a style is given", () => {
    expect(buildFieldConfig({ type: "boolean", args: { boolean_style: "radio" } })).toEqual({ type: "radio" });
    expect(buildFieldConfig({ type: "boolean", args: {}, current: { type: "checkbox" } })).toBeUndefined();
  });
  it("refuses settings that belong to another type", () => {
    expect(() => buildFieldConfig({ type: "number", args: { boolean_style: "radio" } })).toThrow(/boolean_style applies to boolean fields/);
    expect(() => buildFieldConfig({ type: "boolean", args: { precision: 1 } })).toThrow(/apply to number fields/);
    expect(() => buildFieldConfig({ type: "text", args: { precision: 1 } })).toThrow(/a text field has no number or boolean settings/);
    expect(() => buildFieldConfig({ type: null, args: { precision: 1 } })).toThrow(/not known/);
    expect(buildFieldConfig({ type: "text", args: {} })).toBeUndefined();
  });
});

describe("pickField and pickOption", () => {
  it("match by id or by name, with candidates on a miss", () => {
    expect(pickField([stage, estimate], "estimate")).toBe(estimate);
    expect(pickField([stage, estimate], stage.id)).toBe(stage);
    expect(() => pickField([stage, estimate], "Est")).toThrow(/could not resolve custom field "Est"; candidates: Estimate/);
    expect(pickOption(stage, "done")).toBe(done);
    expect(pickOption(stage, review.id)).toBe(review);
    expect(() => pickOption(stage, "Reviw")).toThrow(/could not resolve option of Stage "Reviw"; candidates: none/);
  });
});

describe("parsePlacement", () => {
  const idOf = (value: string | number) => pickOption(stage, value).id;
  it("sends exactly the one neighbour given, resolved", () => {
    expect(parsePlacement({ after: "done" }, idOf)).toEqual({ after: done.id });
    expect(parsePlacement({ before: review.id }, idOf)).toEqual({ before: review.id });
  });
  it("refuses both and neither", () => {
    expect(() => parsePlacement({ after: "done", before: "review" }, idOf)).toThrow(/exactly one of after or before/);
    expect(() => parsePlacement({}, idOf)).toThrow(/exactly one of after or before/);
  });
});
```

Run: `npx vitest run tests/tools/field-refs.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 2: The reference helpers**

Create `src/tools/field-refs.ts`:

```ts
import { z } from "zod";
import { Resolver } from "../resolver.js";
import { booleanStyles, fieldScopes, numberFormats, transferTargetKinds } from "../api/constants.js";
import type { CustomField, CustomFieldOption, FieldConfig, FieldScope, FieldType, NumberFieldConfig, Placement, TransferTarget } from "../client.js";
import { nameOrId } from "./inputs.js";

/** The parameters every custom-field tool takes to say which scope it works in. */
export const fieldScopeShape = {
  scope: z.enum(fieldScopes).describe("Where the field lives: global (every task), a project, a board or a CRM funnel."),
  project: nameOrId.optional().describe("For scope:project; for scope:board, the board's project when `board` is a name."),
  board: nameOrId.optional().describe("For scope:board: the board by id, or by name together with `project`."),
  funnel: nameOrId.optional().describe("For scope:funnel: the CRM funnel by name or id."),
};
export type FieldScopeArgs = z.infer<z.ZodObject<typeof fieldScopeShape>>;

export const transferShape = {
  to: z.enum(transferTargetKinds).describe("The scope to send the field to."),
  to_project: nameOrId.optional().describe("For to:project; for to:board, the board's project when `to_board` is a name."),
  to_board: nameOrId.optional().describe("For to:board: the board by id, or by name together with `to_project`."),
};
export type TransferArgs = z.infer<z.ZodObject<typeof transferShape>>;

interface BoardRef { board: string | number; project?: string | number; }

function requireOwner<T>(value: T | undefined, scope: string, parameter: string): T {
  if (value === undefined) throw new Error(`scope "${scope}" needs \`${parameter}\` (name or id)`);
  return value;
}

async function resolveBoard(resolver: Resolver, { board, project }: BoardRef): Promise<number> {
  const projectId = project === undefined ? undefined : await resolver.resolve({ kind: "project", value: project });
  return resolver.resolve({ kind: "board", value: board, scope: { projectId } });
}

/** The tool is the boundary that narrows the scope enum into one FieldScope variant, resolving the owner's name. */
export async function parseFieldScope(resolver: Resolver, args: FieldScopeArgs): Promise<FieldScope> {
  switch (args.scope) {
    case "global": return { kind: "global" };
    case "project": return { kind: "project", projectId: await resolver.resolve({ kind: "project", value: requireOwner(args.project, "project", "project") }) };
    case "board": return { kind: "board", boardId: await resolveBoard(resolver, { board: requireOwner(args.board, "board", "board"), project: args.project }) };
    case "funnel": return { kind: "funnel", funnelId: await resolver.resolve({ kind: "funnel", value: requireOwner(args.funnel, "funnel", "funnel") }) };
    default: { const _exhaustive: never = args.scope; throw new Error(`unhandled scope ${String(_exhaustive)}`); }
  }
}

export async function parseTransferTarget(resolver: Resolver, args: TransferArgs): Promise<TransferTarget> {
  switch (args.to) {
    case "global": return { kind: "global" };
    case "project": return { kind: "project", projectId: await resolver.resolve({ kind: "project", value: requireOwner(args.to_project, "project", "to_project") }) };
    case "board": return { kind: "board", boardId: await resolveBoard(resolver, { board: requireOwner(args.to_board, "board", "to_board"), project: args.to_project }) };
    default: { const _exhaustive: never = args.to; throw new Error(`unhandled transfer target ${String(_exhaustive)}`); }
  }
}

/** A field by name or id from a list already in hand — no API call. */
export function pickField(fields: CustomField[], value: string | number): CustomField {
  return Resolver.pickEntry("custom field", String(value), fields);
}

/** A field's option by name or id from the field's own list — no API call. */
export function pickOption(field: CustomField, value: string | number): CustomFieldOption {
  return Resolver.pickEntry(`option of ${field.name}`, String(value), field.options);
}

/** Number and boolean settings, flattened so a caller never writes the API's nested `config`. */
export const fieldConfigShape = {
  number_format: z.enum(numberFormats).optional().describe("Number fields: shown as a plain number, a currency or a percent."),
  precision: z.number().int().min(0).max(6).optional().describe("Number fields: decimal places, 0–6."),
  currency_id: z.number().int().min(1).max(10).optional().describe("Number fields shown as currency: a WEEEK currency id, 1–10."),
  boolean_style: z.enum(booleanStyles).optional().describe("Boolean fields: radio or checkbox."),
};
export type FieldConfigArgs = z.infer<z.ZodObject<typeof fieldConfigShape>>;

export interface BuildFieldConfigOptions { type: FieldType | null; args: FieldConfigArgs; current?: FieldConfig | null; }

/**
 * The settings the API wants for a field of `type`, merged over `current`, or undefined when
 * nothing is to be sent. Settings that belong to another type are refused, not dropped.
 */
export function buildFieldConfig({ type, args, current = null }: BuildFieldConfigOptions): FieldConfig | undefined {
  const hasNumberArgs = args.number_format !== undefined || args.precision !== undefined || args.currency_id !== undefined;
  const hasBooleanArgs = args.boolean_style !== undefined;
  if (type === null) {
    if (hasNumberArgs || hasBooleanArgs) throw new Error("this field's type is not known to the server, so its settings cannot be changed here");
    return undefined;
  }
  switch (type) {
    case "number": {
      if (hasBooleanArgs) throw new Error("boolean_style applies to boolean fields only");
      const base = current !== null && "precision" in current ? current : null;
      if (!hasNumberArgs) return undefined;
      const config: NumberFieldConfig = { type: args.number_format ?? base?.type ?? "number", precision: args.precision ?? base?.precision ?? 0 };
      const currency = args.currency_id ?? base?.currency;
      if (currency !== undefined) config.currency = currency;
      return config;
    }
    case "boolean":
      if (hasNumberArgs) throw new Error("number_format, precision and currency_id apply to number fields only");
      return args.boolean_style === undefined ? undefined : { type: args.boolean_style };
    case "text": case "datetime": case "select": case "multiselect": case "member": case "contact": case "link": case "approval":
      if (hasNumberArgs || hasBooleanArgs) throw new Error(`a ${type} field has no number or boolean settings`);
      return undefined;
    default: { const _exhaustive: never = type; throw new Error(`unhandled field type ${String(_exhaustive)}`); }
  }
}

export const placementShape = {
  after: nameOrId.optional().describe("Place it right after this sibling (name or id)."),
  before: nameOrId.optional().describe("Place it right before this sibling (name or id)."),
};
export type PlacementArgs = z.infer<z.ZodObject<typeof placementShape>>;

/** Exactly one neighbour, resolved to its id by `idOf`; the API refuses both and neither. */
export function parsePlacement(args: PlacementArgs, idOf: (value: string | number) => string): Placement {
  if (args.after !== undefined && args.before === undefined) return { after: idOf(args.after) };
  if (args.before !== undefined && args.after === undefined) return { before: idOf(args.before) };
  throw new Error("pass exactly one of after or before");
}
```

Run: `npx vitest run tests/tools/field-refs.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing tool tests**

Create `tests/tools/custom-fields.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { registerCustomFieldTools } from "../../src/tools/custom-fields.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";
import type { CustomField, FieldScope } from "../../src/client.js";

const review = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" };
const done = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Done", color: "green" };
const stage: CustomField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [review, done] };
const estimate: CustomField = { id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Estimate", type: "number", config: { type: "number", precision: 0 }, options: [] };
const ok = { success: true };
const funnelId = "OLY24hy2mC7n9D9l";
const client = () => ({
  projects: { list: vi.fn(async () => [{ id: 1, name: "Marketing" }]) },
  boards: { list: vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]) },
  crm: { funnels: { list: vi.fn(async () => [{ id: funnelId, name: "Sales", customFields: [] }]) } },
  customFields: {
    list: vi.fn(async (_scope: FieldScope) => [stage, estimate]),
    create: vi.fn(async () => stage), update: vi.fn(async () => stage), remove: vi.fn(async () => ok),
    transfer: vi.fn(async () => ok), move: vi.fn(async () => ok),
    createOption: vi.fn(async () => review), updateOption: vi.fn(async () => review), removeOption: vi.fn(async () => ok), moveOption: vi.fn(async () => ok),
  },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerCustomFieldTools, c) }; };

describe("custom-field tools", () => {
  it("weeek_list_custom_fields resolves each scope's owner by name", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_custom_fields", { scope: "global" }))).toEqual([stage, estimate]);
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "global" });
    await h.call("weeek_list_custom_fields", { scope: "project", project: "marketing" });
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "project", projectId: 1 });
    await h.call("weeek_list_custom_fields", { scope: "board", board: "main", project: "Marketing" });
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "board", boardId: 10 });
    await h.call("weeek_list_custom_fields", { scope: "funnel", funnel: "sales" });
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "funnel", funnelId });
  });

  it("weeek_list_custom_fields reports a missing owner without calling the API", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_list_custom_fields", { scope: "project" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/scope "project" needs `project`/);
    expect(c.customFields.list).not.toHaveBeenCalled();
  });

  it("weeek_create_custom_field sends the type and the settings its type takes", async () => {
    const { c, h } = harness();
    await h.call("weeek_create_custom_field", { scope: "project", project: 1, name: "Stage", type: "select" });
    expect(c.customFields.create).toHaveBeenLastCalledWith({ scope: { kind: "project", projectId: 1 }, field: { name: "Stage", type: "select" } });
    await h.call("weeek_create_custom_field", { scope: "global", name: "Cost", type: "number", number_format: "currency", precision: 2, currency_id: 1 });
    expect(c.customFields.create).toHaveBeenLastCalledWith({ scope: { kind: "global" }, field: { name: "Cost", type: "number", config: { type: "currency", precision: 2, currency: 1 } } });
  });

  it("weeek_create_custom_field refuses settings of another type before any call", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_create_custom_field", { scope: "global", name: "Flag", type: "boolean", precision: 1 });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/apply to number fields only/);
    expect(c.customFields.create).not.toHaveBeenCalled();
  });

  it("weeek_update_custom_field finds the field by name and merges settings over its current ones", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_custom_field", { scope: "global", field: "estimate", precision: 2 });
    expect(c.customFields.update).toHaveBeenLastCalledWith({ scope: { kind: "global" }, fieldId: estimate.id, update: { name: undefined, config: { type: "number", precision: 2 } } });
    await h.call("weeek_update_custom_field", { scope: "global", field: stage.id, name: "Phase" });
    expect(c.customFields.update).toHaveBeenLastCalledWith({ scope: { kind: "global" }, fieldId: stage.id, update: { name: "Phase", config: undefined } });
  });

  it("weeek_update_custom_field reports an unknown field with candidates", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_update_custom_field", { scope: "global", field: "Sta", name: "x" });
    expect(res.isError).toBe(true);
    expect(reply(res).candidates).toEqual([{ id: stage.id, name: "Stage" }]);
    expect(c.customFields.update).not.toHaveBeenCalled();
  });

  it("weeek_delete_custom_field needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_custom_field", { scope: "global", field: "Stage" })).toThrow(/confirm/);
    await h.call("weeek_delete_custom_field", { scope: "global", field: "Stage", confirm: true });
    expect(c.customFields.remove).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id });
  });

  it("weeek_transfer_custom_field resolves the target and refuses a funnel field", async () => {
    const { c, h } = harness();
    await h.call("weeek_transfer_custom_field", { scope: "global", field: "Stage", to: "board", to_board: "Main", to_project: "Marketing" });
    expect(c.customFields.transfer).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, target: { kind: "board", boardId: 10 } });
    c.customFields.transfer.mockRejectedValueOnce(new Error("a funnel's custom fields stay in their funnel"));
    const res = await h.call("weeek_transfer_custom_field", { scope: "funnel", funnel: "Sales", field: "Stage", to: "global" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/stay in their funnel/);
  });

  it("weeek_move_custom_field places a funnel field after or before a sibling, exactly one", async () => {
    const { c, h } = harness();
    await h.call("weeek_move_custom_field", { funnel: "Sales", field: "Stage", after: "Estimate" });
    expect(c.customFields.move).toHaveBeenCalledWith({ funnelId, fieldId: stage.id, placement: { after: estimate.id } });
    const both = await h.call("weeek_move_custom_field", { funnel: funnelId, field: "Stage", after: "Estimate", before: "Estimate" });
    expect(reply(both).error).toMatch(/exactly one of after or before/);
    const neither = await h.call("weeek_move_custom_field", { funnel: funnelId, field: "Stage" });
    expect(reply(neither).error).toMatch(/exactly one of after or before/);
    expect(c.customFields.move).toHaveBeenCalledTimes(1);
  });

  it("weeek_add_field_option sends name and colour, and rejects a colour outside the palette", async () => {
    const { c, h } = harness();
    await h.call("weeek_add_field_option", { scope: "global", field: "Stage", name: "Blocked", color: "red" });
    expect(c.customFields.createOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, option: { name: "Blocked", color: "red" } });
    expect(() => h.call("weeek_add_field_option", { scope: "global", field: "Stage", name: "x", color: "magenta" })).toThrow(/color/);
  });

  it("weeek_update_field_option keeps the current name when only the colour changes", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_field_option", { scope: "global", field: "Stage", option: "review", color: "red" });
    expect(c.customFields.updateOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, optionId: review.id, option: { name: "Review", color: "red" } });
  });

  it("weeek_update_field_option reports an unknown option with candidates", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_update_field_option", { scope: "global", field: "Stage", option: "Reviw", name: "x" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/could not resolve option of Stage "Reviw"/);
    expect(c.customFields.updateOption).not.toHaveBeenCalled();
  });

  it("weeek_delete_field_option needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_field_option", { scope: "global", field: "Stage", option: "Done" })).toThrow(/confirm/);
    await h.call("weeek_delete_field_option", { scope: "global", field: "Stage", option: "Done", confirm: true });
    expect(c.customFields.removeOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, optionId: done.id });
  });

  it("weeek_move_field_option resolves both options from the field", async () => {
    const { c, h } = harness();
    await h.call("weeek_move_field_option", { scope: "global", field: "Stage", option: "Done", before: "Review" });
    expect(c.customFields.moveOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, optionId: done.id, placement: { before: review.id } });
  });

  // Each write must drop the cached field lists: warm, write, list again, expect a second fetch.
  describe.each([
    ["weeek_create_custom_field", { scope: "global", name: "N", type: "text" }],
    ["weeek_update_custom_field", { scope: "global", field: "Stage", name: "N" }],
    ["weeek_delete_custom_field", { scope: "global", field: "Stage", confirm: true }],
    ["weeek_transfer_custom_field", { scope: "global", field: "Stage", to: "project", to_project: 1 }],
    ["weeek_move_custom_field", { funnel: funnelId, field: "Stage", after: "Estimate" }],
    ["weeek_add_field_option", { scope: "global", field: "Stage", name: "N", color: "blue" }],
    ["weeek_update_field_option", { scope: "global", field: "Stage", option: "Done", name: "N" }],
    ["weeek_delete_field_option", { scope: "global", field: "Stage", option: "Done", confirm: true }],
    ["weeek_move_field_option", { scope: "global", field: "Stage", option: "Done", after: "Review" }],
  ])("%s forgets the field lists", (tool, args) => {
    it("so the next lookup loads again", async () => {
      const { c, h } = harness();
      await h.call("weeek_list_custom_fields", { scope: "global" });
      await h.call(tool, args);
      // A write may load its own scope first, so the count is taken after it: the next global list must be one fresh call.
      const after = c.customFields.list.mock.calls.length;
      await h.call("weeek_list_custom_fields", { scope: "global" });
      expect(c.customFields.list.mock.calls.length).toBe(after + 1);
      expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "global" });
    });
  });
});
```

Append to `tests/helpers/tool-names.ts`:

```ts
export const customFieldToolNames = [
  "weeek_list_custom_fields", "weeek_create_custom_field", "weeek_update_custom_field", "weeek_delete_custom_field",
  "weeek_transfer_custom_field", "weeek_move_custom_field",
  "weeek_add_field_option", "weeek_update_field_option", "weeek_delete_field_option", "weeek_move_field_option",
].sort();
```

and include it in `allToolNames`: `[...defaultToolNames, ...timeToolNames, ...projectToolNames, ...customFieldToolNames].sort()`.

Append to `tests/toolsets/register.test.ts` (import `customFieldToolNames`):

```ts
  it("registers only core + custom-fields for the custom-fields toolset", async () => {
    const ctx = context();
    registerToolsets(ctx, ["custom-fields"]);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(["weeek_version", ...customFieldToolNames].sort());
  });
```

Run: `npx vitest run tests/tools/custom-fields.test.ts tests/toolsets tests/tool-quality.test.ts tests/config.test.ts`
Expected: FAIL — module missing; `all` registers 54, not 64; `custom-fields` is not a toolset name.

- [ ] **Step 4: The tools and the toolset**

Create `src/tools/custom-fields.ts`:

```ts
import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { Resolver } from "../resolver.js";
import { fieldTypes, optionColors } from "../api/constants.js";
import { isOneOf } from "../api/responses.js";
import type { CustomField, FieldScope } from "../client.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import {
  buildFieldConfig, fieldConfigShape, fieldScopeShape, parseFieldScope, parsePlacement, parseTransferTarget,
  pickField, pickOption, placementShape, transferShape, type FieldScopeArgs,
} from "./field-refs.js";

const fieldRef = { ...fieldScopeShape, field: nameOrId.describe("The custom field, by name or id.") };
const optionRef = { ...fieldRef, option: nameOrId.describe("The option, by name or id.") };
const nameText = z.string().min(1).max(255);
const optionColor = z.enum(optionColors);

interface FoundField { scope: FieldScope; field: CustomField; }

/** The scope the arguments name, and the field inside it with its options and settings. */
async function findField(resolver: Resolver, args: FieldScopeArgs & { field: string | number }): Promise<FoundField> {
  const scope = await parseFieldScope(resolver, args);
  const field = await resolver.find({ kind: "customField", value: args.field, scope: { fieldScope: scope } });
  return { scope, field };
}

/** The custom-fields toolset: fields and their options, in every scope the API has. */
export function registerCustomFieldTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_custom_fields", {
    description: "List the custom fields of one scope — global (every task), a project, a board or a CRM funnel: id, name, type, number/boolean settings and select options. A board's fields are read off its tasks (the API lists them nowhere else), so an empty board shows none.",
    inputSchema: fieldScopeShape,
  }, async (args) => resolver.list({ kind: "customField", scope: { fieldScope: await parseFieldScope(resolver, args) } }));

  registerJsonTool(server, "weeek_create_custom_field", {
    description: "Create a custom field in a scope (global, a project, a board or a funnel) with a `name` and a `type`: text, number, boolean, datetime, select, multiselect, member, contact, link or approval. Number fields take number_format, precision and currency_id; boolean fields boolean_style. Add a select field's choices with weeek_add_field_option.",
    inputSchema: { ...fieldScopeShape, name: nameText, type: z.enum(fieldTypes), ...fieldConfigShape },
  }, async (args) => {
    const scope = await parseFieldScope(resolver, args);
    const config = buildFieldConfig({ type: args.type, args });
    const field = await client.customFields.create({ scope, field: { name: args.name, type: args.type, config } });
    resolver.forget({ kind: "customField" });
    return field;
  });

  registerJsonTool(server, "weeek_update_custom_field", {
    description: "Rename a custom field (by name or id, inside its scope) or change its number/boolean settings; settings you omit keep their value. The type cannot change.",
    inputSchema: { ...fieldRef, name: nameText.optional(), ...fieldConfigShape },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const config = buildFieldConfig({ type: field.type, args, current: field.config });
    const updated = await client.customFields.update({ scope, fieldId: field.id, update: { name: args.name, config } });
    resolver.forget({ kind: "customField" });
    return updated;
  });

  registerJsonTool(server, "weeek_delete_custom_field", {
    description: "Permanently delete a custom field (by name or id, inside its scope) together with every value held in it. Irreversible; requires confirm:true.",
    inputSchema: { ...fieldRef, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const removal = await client.customFields.remove({ scope, fieldId: field.id });
    resolver.forget({ kind: "customField" });
    return removal;
  });

  registerJsonTool(server, "weeek_transfer_custom_field", {
    description: "Move a global, project or board custom field to another scope: `to` global, a project (`to_project`) or a board (`to_board` by id, or by name with `to_project`). Funnel fields cannot leave their funnel.",
    inputSchema: { ...fieldRef, ...transferShape },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const target = await parseTransferTarget(resolver, args);
    const outcome = await client.customFields.transfer({ scope, fieldId: field.id, target });
    resolver.forget({ kind: "customField" });
    return outcome;
  });

  registerJsonTool(server, "weeek_move_custom_field", {
    description: "Reorder a CRM funnel's custom fields: place `field` right after or right before another field of the same funnel (names or ids; exactly one of the two). Task-manager fields have no order the API exposes.",
    inputSchema: { funnel: nameOrId, field: nameOrId, ...placementShape },
  }, async (args) => {
    const funnelId = await resolver.resolve({ kind: "funnel", value: args.funnel });
    const siblings = await resolver.list({ kind: "customField", scope: { fieldScope: { kind: "funnel", funnelId } } });
    const idOf = (value: string | number) => pickField(siblings, value).id;
    const outcome = await client.customFields.move({ funnelId, fieldId: idOf(args.field), placement: parsePlacement(args, idOf) });
    resolver.forget({ kind: "customField" });
    return outcome;
  });

  registerJsonTool(server, "weeek_add_field_option", {
    description: "Add a choice to a select or multiselect custom field (field by name or id, inside its scope): a `name` and a `color` from WEEEK's palette (blue, light_blue, dark_purple, purple, dark_pink, pink, light_pink, red, turquoise, green, light_green, dark_yellow, yellow).",
    inputSchema: { ...fieldRef, name: nameText, color: optionColor },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const option = await client.customFields.createOption({ scope, fieldId: field.id, option: { name: args.name, color: args.color } });
    resolver.forget({ kind: "customField" });
    return option;
  });

  registerJsonTool(server, "weeek_update_field_option", {
    description: "Rename or recolour one choice of a select/multiselect custom field (option by name or id). Fields you omit keep their current value.",
    inputSchema: { ...optionRef, name: nameText.optional(), color: optionColor.optional() },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const current = pickOption(field, args.option);
    // PUT replaces both fields; the current option is already in hand from the field's list.
    const color = args.color ?? (isOneOf(optionColors, current.color) ? current.color : undefined);
    if (color === undefined) throw new Error(`option "${current.name}" has a colour (${current.color}) outside the palette; pass color to set one`);
    const option = await client.customFields.updateOption({ scope, fieldId: field.id, optionId: current.id, option: { name: args.name ?? current.name, color } });
    resolver.forget({ kind: "customField" });
    return option;
  });

  registerJsonTool(server, "weeek_delete_field_option", {
    description: "Permanently delete one choice of a select/multiselect custom field (option by name or id); tasks that chose it lose that value. Irreversible; requires confirm:true.",
    inputSchema: { ...optionRef, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const removal = await client.customFields.removeOption({ scope, fieldId: field.id, optionId: pickOption(field, args.option).id });
    resolver.forget({ kind: "customField" });
    return removal;
  });

  registerJsonTool(server, "weeek_move_field_option", {
    description: "Reorder the choices of a select/multiselect custom field: place `option` right after or right before another option (names or ids; exactly one of the two).",
    inputSchema: { ...optionRef, ...placementShape },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const placement = parsePlacement(args, (value) => pickOption(field, value).id);
    const outcome = await client.customFields.moveOption({ scope, fieldId: field.id, optionId: pickOption(field, args.option).id, placement });
    resolver.forget({ kind: "customField" });
    return outcome;
  });
}
```

`src/toolsets/constants.ts`: `export const toolsetNames = ["tasks", "time", "projects", "custom-fields", "all"] as const;` and add to the comment block: `// custom-fields: field and option administration in every scope; values on tasks stay in tasks.`

`src/toolsets/register.ts`: import `registerCustomFieldTools` from `../tools/custom-fields.js` and add `"custom-fields": registerCustomFieldTools,` to `registrars`.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm test`
Expected: green; `tests/tool-quality.test.ts` lists 64 tools and gates the three `weeek_delete_*` tools; every description is under 600 characters.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/tools/field-refs.ts src/tools/custom-fields.ts src/toolsets tests/tools/field-refs.test.ts tests/tools/custom-fields.test.ts tests/helpers/tool-names.ts tests/toolsets/register.test.ts
git commit -m "feat(tools): custom-fields toolset — fields and options in every scope"
```

---

### Task 8: Custom-field values on tasks

What a task user needs: see a task's field values with readable names, and set them by name on create and update. No new tool; three existing ones grow additively.

**Files:**
- Modify: `src/api/types.ts` (`FieldValue`, `TaskFieldValue`; `WeeekTask.customFields`; `NewTask.customFields`), `src/api/tasks.ts` (`toFieldValue`, create body), `src/dates.ts` (`parseDateTime`)
- Create: `src/tools/field-values.ts`, `tests/tools/field-values.test.ts`
- Modify: `src/tools/tasks.ts` (`fields` on create/update; `buildTaskPatch` options object), `tests/dates.test.ts`, `tests/api/tasks.test.ts`, `tests/tools/tasks.test.ts`

**Interfaces:**
- Produces: `FieldValue = string | number | boolean | string[] | null`; `TaskFieldValue { id; name; type: FieldType | null; value: FieldValue }`; `WeeekTask.customFields: TaskFieldValue[]`; `NewTask.customFields?: Record<string, unknown>`; `parseDateTime(input, now?): string`; `fieldValues` zod schema and `encodeTaskFields({ resolver, fields, values }): Promise<Record<string, unknown>>`; `buildTaskPatch({ resolver, input, taskFields })`.
- Consumes: `pickField`, `pickOption` (Task 7), `resolveMembers` (Task 2), `client.tasks.getFields` (Task 5), `resolver.list` (Task 6).

- [ ] **Step 1: Write the failing tests**

Append to `tests/dates.test.ts`:

```ts
describe("parseDateTime", () => {
  it("keeps an ISO instant and anchors a relative time on now", () => {
    expect(Date.parse(parseDateTime("2026-08-01T10:00:00Z", now))).toBe(Date.parse("2026-08-01T10:00:00Z"));
    expect(parseDateTime("in 2 hours", now)).toBe(new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString());
  });
  it("throws on nonsense", () => {
    expect(() => parseDateTime("banana", now)).toThrow(/could not parse date/);
  });
});
```

(import `parseDateTime` beside `parseDay`.)

Append to `tests/api/tasks.test.ts`:

```ts
  it("get shows custom-field values with option ids turned into option names", async () => {
    const stage = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", options: [{ id: "o1", name: "Review", color: "blue" }], value: "o1" };
    const tags = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Areas", type: "multiselect", options: [{ id: "a", name: "API", color: "red" }], value: ["a", "zz"] };
    const estimate = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Estimate", type: "number", options: [], value: 5 };
    const empty = { id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Notes", type: "text", options: [], value: null };
    const f = jsonFetch(200, { success: true, task: { ...rawTask, customFields: [stage, tags, estimate, empty] } });
    expect((await new TasksApi(httpWith(f)).get(78)).customFields).toEqual([
      { id: stage.id, name: "Stage", type: "select", value: "Review" },
      { id: tags.id, name: "Areas", type: "multiselect", value: ["API", "zz"] },
      { id: estimate.id, name: "Estimate", type: "number", value: 5 },
      { id: empty.id, name: "Notes", type: "text", value: null },
    ]);
  });

  it("create sends customFields when given", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).create({ title: "T", projectId: 1, customFields: { "0b1e4d7c-1111-4aaa-8bbb-000000000001": "o1" } });
    expect(sent(f).json()).toEqual({ title: "T", locations: [{ projectId: 1 }], customFields: { "0b1e4d7c-1111-4aaa-8bbb-000000000001": "o1" } });
  });
```

and add `customFields: []` to `normalisedTask`.

Create `tests/tools/field-values.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { encodeTaskFields } from "../../src/tools/field-values.js";
import { stubMembers } from "../helpers/tool-harness.js";
import type { CustomField } from "../../src/client.js";

const [ilya, ann] = stubMembers;
const review = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" };
const done = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Done", color: "green" };
const field = (over: Partial<CustomField> & Pick<CustomField, "name" | "type">): CustomField => ({ id: `id-${over.name}`, config: null, options: [], ...over });
const fields: CustomField[] = [
  field({ name: "Notes", type: "text" }), field({ name: "Link", type: "link" }), field({ name: "Estimate", type: "number" }),
  field({ name: "Urgent", type: "boolean" }), field({ name: "Deadline", type: "datetime" }), field({ name: "Stage", type: "select", options: [review, done] }),
  field({ name: "Areas", type: "multiselect", options: [review, done] }), field({ name: "Owners", type: "member" }), field({ name: "Sign-off", type: "approval" }),
  field({ name: "Client", type: "contact" }), field({ name: "Mystery", type: null }),
];
const resolver = () => new Resolver({ workspace: { listMembers: async () => stubMembers } } as any, new NameCache(100_000, () => 0));

describe("encodeTaskFields", () => {
  it("encodes every type by name, resolving options and members", async () => {
    const body = await encodeTaskFields({ resolver: resolver(), fields, values: {
      Link: "https://x.y", Estimate: 5, Urgent: true, Deadline: "2026-08-01T10:00:00Z",
      Stage: "review", Areas: ["Done", review.id], Owners: ["ilya", ann.id], "Sign-off": ["Ann"], Client: "c1", "id-Notes": null,
    } });
    expect(body).toEqual({
      "id-Notes": null, "id-Link": "https://x.y", "id-Estimate": 5, "id-Urgent": true, "id-Deadline": "2026-08-01T10:00:00.000Z",
      "id-Stage": review.id, "id-Areas": [done.id, review.id], "id-Owners": [ilya.id, ann.id], "id-Sign-off": [ann.id], "id-Client": "c1",
    });
  });

  it("names the field and the shape it takes when the value has the wrong shape", async () => {
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Estimate: "five" } })).rejects.toThrow(/custom field "Estimate" \(number\) takes a number/);
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Areas: "Done" } })).rejects.toThrow(/takes a list of option names or ids/);
  });

  it("reports an unknown option or field with candidates, before anything else is encoded", async () => {
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Stage: "Reviw" } })).rejects.toMatchObject({ name: "ResolutionError", candidates: [] });
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Stag: "Review" } })).rejects.toMatchObject({ name: "ResolutionError", candidates: [{ id: "id-Stage", name: "Stage" }] });
  });

  it("refuses a field whose type the server does not know", async () => {
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Mystery: "x" } })).rejects.toThrow(/type this server does not know/);
  });
});
```

Append to `tests/tools/tasks.test.ts`:

```ts
  it("create_task resolves fields against the global and the project lists and sends customFields", async () => {
    const stage = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [{ id: "o1", name: "Review", color: "blue" }] };
    const estimate = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Estimate", type: "number", config: null, options: [] };
    const list = vi.fn(async (scope: { kind: string }) => (scope.kind === "global" ? [estimate] : [stage]));
    const create = vi.fn(async (b: any) => ({ id: 5, ...b }));
    const h = harness({ ...baseClient, customFields: { list }, tasks: { create } });
    await h.get("weeek_create_task")!({ title: "x", project: "Marketing", fields: { Stage: "review", Estimate: 3 } });
    expect(list).toHaveBeenCalledWith({ kind: "global" });
    expect(list).toHaveBeenCalledWith({ kind: "project", projectId: 1 });
    expect(create).toHaveBeenCalledWith({ title: "x", projectId: 1, customFields: { [stage.id]: "o1", [estimate.id]: 3 } });
  });

  it("update_task reads the task's own fields, then sends customFields", async () => {
    const stage = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [{ id: "o1", name: "Review", color: "blue" }] };
    const getFields = vi.fn(async (_id: number) => [stage]);
    const update = vi.fn(async (id: number, patch: any) => ({ id, ...patch }));
    const h = harness({ ...baseClient, tasks: { getFields, update } });
    await h.get("weeek_update_task")!({ id: 3, fields: { Stage: "Review" }, title: "New" });
    expect(getFields).toHaveBeenCalledWith(3);
    expect(update).toHaveBeenCalledWith(3, { title: "New", customFields: { [stage.id]: "o1" } });
  });

  it("update_task does not read the task when no fields are given", async () => {
    const getFields = vi.fn();
    const update = vi.fn(async (id: number, patch: any) => ({ id, ...patch }));
    const h = harness({ ...baseClient, tasks: { getFields, update } });
    await h.get("weeek_update_task")!({ id: 3, title: "New" });
    expect(getFields).not.toHaveBeenCalled();
  });
```

Run: `npx vitest run tests/dates.test.ts tests/api/tasks.test.ts tests/tools/field-values.test.ts tests/tools/tasks.test.ts`
Expected: FAIL — `parseDateTime` missing, `customFields` missing on the task, module missing, `fields` rejected by the schemas.

- [ ] **Step 2: Types, normaliser, create body, date-time**

`src/api/types.ts`:

```ts
/** What a caller may pass for one field, and what a task shows back: option ids read as option names. null clears. */
export type FieldValue = string | number | boolean | string[] | null;
/** A custom field as a task carries it. */
export interface TaskFieldValue { id: string; name: string; type: FieldType | null; value: FieldValue; }
```

Add `customFields: TaskFieldValue[];` to `WeeekTask` (after `attachments`) and `customFields?: Record<string, unknown>;` to `NewTask` with the comment `/** Field ids to wire values; built by encodeTaskFields. */`.

`src/api/tasks.ts` — beside `fieldsOf`:

```ts
/** Option ids read as option names; everything else as sent, coerced into the shapes a caller may pass back. */
function displayValue(value: unknown, options: CustomFieldOption[]): FieldValue {
  const named = (item: unknown): string => {
    const option = options.find((candidate) => candidate.id === item);
    if (option) return option.name;
    const r = asRecord(item);
    return String(r.name ?? r.id ?? item);
  };
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(named);
  return named(value);
}

function toFieldValue(raw: unknown): TaskFieldValue {
  const field = toCustomField(raw);
  return { id: field.id, name: field.name, type: field.type, value: displayValue(asRecord(raw).value, field.options) };
}
```

In `toTask` add `customFields: Array.isArray(r.customFields) ? r.customFields.map(toFieldValue) : [],` after `attachments`. In `create` add `if (newTask.customFields !== undefined) payload.customFields = newTask.customFields;` before the request. Extend the type imports with `CustomFieldOption, FieldValue, TaskFieldValue`.

`src/dates.ts`:

```ts
/** A natural-language date or time as an ISO 8601 instant, for datetime custom fields. */
export function parseDateTime(input: string, now: Date = new Date()): string {
  const dt = chrono.parseDate(input, now, { forwardDate: true });
  if (!dt) throw new Error(`could not parse date: "${input}"`);
  return dt.toISOString();
}
```

- [ ] **Step 3: The encoder**

Create `src/tools/field-values.ts`:

```ts
import { z } from "zod";
import type { Resolver } from "../resolver.js";
import type { CustomField, FieldValue } from "../client.js";
import { parseDateTime } from "../dates.js";
import { resolveMembers } from "./members.js";
import { pickField, pickOption } from "./field-refs.js";

/** What a caller may pass for one field; null clears it. */
export const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
export const fieldValues = z.record(z.string(), fieldValue).describe(
  "Custom-field values by field name or id. text/link: a string; number: a number; boolean: true/false; datetime: a natural-language date or time; select: an option name; multiselect: option names; member/approval: member names; contact: a contact id; null clears the field.",
);
export type FieldValues = z.infer<typeof fieldValues>;

export interface EncodeTaskFieldsOptions { resolver: Resolver; fields: CustomField[]; values: FieldValues; }

/** The `customFields` body: field ids to wire values, each name resolved the way its field's type needs. */
export async function encodeTaskFields({ resolver, fields, values }: EncodeTaskFieldsOptions): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = pickField(fields, key);
    body[field.id] = value === null ? null : await encodeFieldValue(resolver, field, value);
  }
  return body;
}

type GivenValue = Exclude<FieldValue, null>;

function wrongShape(field: CustomField, wanted: string): Error {
  return new Error(`custom field "${field.name}" (${field.type}) takes ${wanted}`);
}
function wantString(field: CustomField, value: GivenValue, wanted: string): string {
  if (typeof value !== "string") throw wrongShape(field, wanted);
  return value;
}
function wantList(field: CustomField, value: GivenValue, wanted: string): string[] {
  if (!Array.isArray(value)) throw wrongShape(field, wanted);
  return value;
}

async function encodeFieldValue(resolver: Resolver, field: CustomField, value: GivenValue): Promise<unknown> {
  switch (field.type) {
    case "text": case "link": return wantString(field, value, "a string");
    case "number":
      if (typeof value !== "number") throw wrongShape(field, "a number");
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw wrongShape(field, "true or false");
      return value;
    case "datetime": return parseDateTime(wantString(field, value, "a date or time"));
    case "select": return pickOption(field, wantString(field, value, "one option name or id")).id;
    case "multiselect": return wantList(field, value, "a list of option names or ids").map((item) => pickOption(field, item).id);
    case "member": case "approval": return resolveMembers(resolver, wantList(field, value, "a list of member names or ids"));
    case "contact": return wantString(field, value, "a contact id");
    case null: throw new Error(`custom field "${field.name}" has a type this server does not know; set it in WEEEK`);
    default: { const _exhaustive: never = field.type; throw new Error(`unhandled field type ${String(_exhaustive)}`); }
  }
}
```

- [ ] **Step 4: `fields` on the task tools**

In `src/tools/tasks.ts`:
- import `fieldValues, encodeTaskFields` from `./field-values.js` and `type CustomField` from `../client.js`;
- add `fields: fieldValues.optional(),` to both `createShape` and `updateShape`;
- in `buildNewTask`, before `return newTask;`:

```ts
  if (input.fields !== undefined) {
    // A new task can carry global and project fields; a board's own fields are set with weeek_update_task once the task exists.
    const fields = [
      ...(await resolver.list({ kind: "customField" })),
      ...(await resolver.list({ kind: "customField", scope: { fieldScope: { kind: "project", projectId } } })),
    ];
    newTask.customFields = await encodeTaskFields({ resolver, fields, values: input.fields });
  }
```

- `buildTaskPatch` takes an options object (three related arguments now):

```ts
export interface BuildTaskPatchOptions {
  resolver: Resolver;
  input: UpdateInput;
  /** The task's own fields — what `fields` names are resolved against; [] when none are given. */
  taskFields: CustomField[];
}

/** The PUT body for weeek_update_task: only the fields given, names resolved to ids. */
export async function buildTaskPatch({ resolver, input, taskFields }: BuildTaskPatchOptions): Promise<Record<string, unknown>> {
  …existing body…
  if (input.fields !== undefined) patch.customFields = await encodeTaskFields({ resolver, fields: taskFields, values: input.fields });
  return patch;
}
```

- the `weeek_update_task` handler:

```ts
  }, async (args) => {
    const taskFields = args.fields === undefined ? [] : await client.tasks.getFields(args.id);
    return client.tasks.update(args.id, await buildTaskPatch({ resolver, input: args, taskFields }));
  });
```

- descriptions: `weeek_create_task` adds ", and custom-field values in `fields` by field name (global and project fields)"; `weeek_update_task` adds "and `fields`: custom-field values by field name (select options and members by name too; null clears)"; `weeek_get_task` adds "custom-field values (`customFields`, option names shown)".

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/api/types.ts src/api/tasks.ts src/dates.ts src/tools/field-values.ts src/tools/tasks.ts tests/dates.test.ts tests/api/tasks.test.ts tests/tools/field-values.test.ts tests/tools/tasks.test.ts
git commit -m "feat(tasks): read and set custom-field values by name"
```

---

### Task 9: Docs, manifests, release 0.7.0, live smoke

**Files:**
- Modify: `README.md`, `docs/FOLLOWUPS.md`, `manifest.json`, `server.json`, `package.json`, `package-lock.json`

- [ ] **Step 1: Measure the tool-list payloads**

The README quotes bytes per toolset. Measure them from the built server (a script outside the repo cannot resolve the package's imports, so it lives in the git-ignored `.superpowers/` folder and is deleted afterwards):

```bash
npm run build && mkdir -p .superpowers && cat > .superpowers/measure.mjs <<'EOF'
import { buildServer } from "../dist/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
for (const toolsets of [["tasks"], ["time"], ["projects"], ["custom-fields"], ["all"]]) {
  const server = buildServer({ baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024, toolsets });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "m", version: "0" });
  await client.connect(b);
  const { tools } = await client.listTools();
  console.log(toolsets.join(","), tools.length, "tools", JSON.stringify(tools).length, "bytes");
  await client.close(); await server.close();
}
EOF
node .superpowers/measure.mjs && rm .superpowers/measure.mjs
```

Expected: `tasks` 25 tools (bytes a little above 14 795 — the `fields` records and three longer descriptions), `time` 5, `projects` 26, `custom-fields` 11, `all` 64 (`weeek_version` is counted once). Write the `tasks` and `all` byte counts into the README below.

- [ ] **Step 2: README**

In `## Toolsets`, add the row before `all`:

```markdown
| `custom-fields` | `weeek_list_custom_fields`, `weeek_create_custom_field`, `weeek_update_custom_field`, `weeek_delete_custom_field`, `weeek_transfer_custom_field`, `weeek_move_custom_field`, `weeek_add_field_option`, `weeek_update_field_option`, `weeek_delete_field_option`, `weeek_move_field_option` | |
```

Replace the paragraph after the table with (numbers from Step 1):

```markdown
`weeek_version` is always available. The default is the task surface: <tasks bytes> bytes of
tool schemas per request; `all` is <all bytes> bytes. `crm` (1.0.0) arrives in the next release;
an unknown name is rejected at startup with the list of valid ones.

Custom-field **values** need no extra toolset: `weeek_get_task` returns them, and
`weeek_create_task` / `weeek_update_task` take `fields: { "Estimate": 5, "Stage": "Review" }` by
field name. The `custom-fields` toolset is for administering the fields themselves — in the
global scope, a project, a board or a CRM funnel. A board's fields are read off its tasks because
the API lists them nowhere else, so an empty board shows none.

Upgrading from 0.6.0: no tool was renamed or removed; `WEEEK_TOOLSETS=tasks` is still the
default. Opt in with `custom-fields` or `all`.
```

Change the two example lines to:

```bash
WEEEK_TOOLSETS=tasks,custom-fields npx -y weeek-mcp-smart   # add field administration
WEEEK_TOOLSETS=all npx -y weeek-mcp-smart                   # everything
```

In the opening example, extend the `weeek_create_task` call with `fields: { "Estimate": 5 }` on its own line, and the sentence after it with "… — all by name, all one call, custom fields included."

In `## Safety`, extend the fourth bullet's list: "a project, board, column, tag, portfolio, comment, time entry, custom field or field option; …".

- [ ] **Step 3: Manifests**

`manifest.json` → `user_config.weeek_toolsets.description`: `"Comma-separated tool groups to expose: tasks (default), time, projects, custom-fields — or all"`; in `long_description` mention custom fields in one clause.

`server.json` → the `WEEEK_TOOLSETS` description: `"Comma-separated tool groups to expose: tasks (default), time, projects, custom-fields — or \"all\""`; `version` fields to `0.7.0` (both the top-level one and the package's).

- [ ] **Step 4: FOLLOWUPS**

Add item 23:

```markdown
23. **Phase 3 leaves to verify live** — the Phase 3 smoke (plan Task 9 Step 8) records each outcome here. Every custom-field shape below was built from the spec alone: the workspace had no custom fields when Phase 3 was written. (a) **Board fields**: does a task's `customFields` list every field that applies to it, including unset ones (`value: null`) — the premise of reading a board's fields off its first task; and does `GET /tm/projects/{id}`'s `customFields` hold only the project's own fields? (b) **Funnel ids are opaque** (`OLY24hy2mC7n9D9l`, verified 2026-10-14) — the resolver's `opaque` shape; Phase 4 should expect the same for statuses and deals. (c) The **select value shape** on read: an option id, or an object — `displayValue` accepts both. (d) **Option colours**: the request bodies list 13 names, the schema 12 (`dark_green` vs `turquoise`/`yellow`); which the API accepts and returns. (e) **`move` bodies** declare both `after` and `before` required; the server sends one. (f) Does `customFields: { "<id>": null }` **clear** a value? (g) The **datetime** wire format: the spec says ISO 8601; the server sends `toISOString()` (UTC, milliseconds). (h) `CustomFieldValue.type` lacks `number`; a number field's value on a task. (i) What `GET /tm/custom-fields` returns in a workspace with project fields too — only global ones? (j) Currency ids 1–10: `GET /crm/currencies` (Phase 4) names them.
```

Strike nothing else; items 20 and 22 were updated in Tasks 1–3 and 6.

- [ ] **Step 5: Bump the version and run the gate**

```bash
npm version 0.7.0 --no-git-tag-version
npm run typecheck && npm test && npm run build
git status --short
```

Expected: `package.json` and `package-lock.json` at 0.7.0; gate green.

- [ ] **Step 6: Commit, push, open the PR (each after go-ahead)**

```bash
git add README.md docs/FOLLOWUPS.md manifest.json server.json package.json package-lock.json
git commit -m "chore: release 0.7.0"
git push -u origin feat/phase-3-custom-fields
gh pr create --base main --title "feat: custom fields — four scopes, options, values on tasks (phase 3)" --body-file - <<'EOF'
Phase 3 of the full-API-coverage design (docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md).

- 39 operations registered and typed: the 38 custom-field operations (global, project, board, funnel) and `GET /crm/funnels`; `notYetImplemented` holds the 62 CRM operations of Phase 4
- New `custom-fields` toolset (10 tools): list / create / update / delete / transfer / move fields, add / update / delete / move options — every owner, field and option by name or id
- `tasks` toolset: `weeek_get_task` and `weeek_list_tasks` return `customFields` with option names; `weeek_create_task`, `weeek_create_tasks` and `weeek_update_task` take `fields` by field name
- Resolver: `funnel` kind with an opaque id shape (live funnel ids are not UUIDs), `customField` kind scoped by `FieldScope`, `list` and `find` returning entries
- Entry list from the Phase 2 review closed: `tests/` is typechecked in CI, normalisers take `unknown`, the test gaps are filled
- Every delete tool requires `confirm:true` and carries `destructiveHint`; `tests/tool-quality.test.ts` pins the 64-tool surface

Existing tool names and parameters are unchanged. `WEEEK_TOOLSETS` unset still registers only `tasks`.
EOF
```

- [ ] **Step 7: After the PR is merged — tag, which publishes (after go-ahead)**

```bash
git checkout main && git pull
git tag v0.7.0 && git push origin v0.7.0
```

CI (`release.yml`) verifies the tag equals `package.json`'s version, runs the tests, publishes to npm and the MCP registry, and attaches the `.mcpb` to a GitHub Release. Watch it at https://github.com/IlyaIvanchikov/weeek-mcp/actions. Then check the npm page, the registry (`curl --interface <non-VPN interface>` if on a VPN) and the GitHub Release as in Phase 2.

- [ ] **Step 8: Live smoke (user-run, token stays in the server)**

With the published 0.7.0 configured as the `weeek` MCP server and `WEEEK_TOOLSETS=all` (restart the client after changing it). Record every unexpected outcome in FOLLOWUPS #23. The Phase 2 smoke (FOLLOWUPS #21) is still open and can run on the same build.

1. 🔵 `weeek_version` → `0.7.0`; the client lists 64 tools.
2. 🟢 `weeek_create_project { name: "phase-3 smoke" }`; `weeek_create_task { title: "smoke", project: "phase-3 smoke" }` → task T.
3. 🟢 `weeek_create_custom_field { scope: "global", name: "Estimate", type: "number", precision: 1 }`; `weeek_list_custom_fields { scope: "global" }` shows it with `config`.
4. 🟢 `weeek_create_custom_field { scope: "project", project: "phase-3 smoke", name: "Stage", type: "select" }`; `weeek_add_field_option { scope: "project", project: "phase-3 smoke", field: "Stage", name: "Review", color: "blue" }`, then `{ name: "Done", color: "green" }`; `weeek_update_field_option { …, option: "Done", color: "yellow" }` → note whether `yellow` is accepted (#23 d); `weeek_move_field_option { …, option: "Done", before: "Review" }` (#23 e).
5. 🟢 `weeek_update_task { id: T, fields: { "Estimate": 2.5, "Stage": "Review" } }` → `weeek_get_task { id: T }` shows `customFields` with `Stage: "Review"` and `Estimate: 2.5` (#23 c, h). Then `fields: { "Estimate": null }` → `Estimate` is `null` on re-read (#23 f).
6. 🟢 `weeek_create_task { title: "smoke 2", project: "phase-3 smoke", fields: { "Stage": "Done" } }` → the created task shows `Stage: "Done"`.
7. 🔵 `weeek_create_board { project: "phase-3 smoke", name: "B" }`; `weeek_create_custom_field { scope: "board", board: "B", project: "phase-3 smoke", name: "Lane", type: "text" }`; `weeek_list_custom_fields { scope: "board", board: "B", project: "phase-3 smoke" }` → empty while the board has no task; `weeek_move_task { id: T, board_id: <B>, column: "<a column of B>" }` (list columns first); list again → shows `Lane` only (#23 a). `weeek_get_project { project: "phase-3 smoke" }` → `customFields` holds `Stage` only (#23 a, i).
8. 🟢 `weeek_create_custom_field { scope: "global", name: "When", type: "datetime" }`; `weeek_update_task { id: T, fields: { "When": "tomorrow 10:00" } }` → re-read shows the stored instant (#23 g).
9. 🟢 `weeek_transfer_custom_field { scope: "global", field: "Estimate", to: "project", to_project: "phase-3 smoke" }` → it leaves the global list and appears in the project's; back again with `to: "global"`.
10. 🟢 `weeek_update_custom_field { scope: "global", field: "Estimate", name: "Points", number_format: "percent" }` → re-read shows the new name and config.
11. 🔵 If the workspace has a CRM funnel: `weeek_create_custom_field { scope: "funnel", funnel: "<its name>", name: "Source", type: "text" }`, a second one, `weeek_move_custom_field { funnel: …, field: "Source", after: "<the other>" }`, then delete both with `confirm: true` (#23 b).
12. 🔴 `weeek_delete_field_option { …, option: "Done", confirm: true }`; `weeek_delete_custom_field` for `Stage`, `Points`, `When`, `Lane` (each with its scope and `confirm: true`); `weeek_delete_board`, `weeek_delete_task { id: T }`, the second task, then `weeek_delete_project { project: "phase-3 smoke", confirm: true }`.
13. 🔴 Restart with `WEEEK_TOOLSETS=bogus` → exits with `… valid values: tasks, time, projects, custom-fields, all`.

---

## Self-review (done while writing; kept so a reader can audit it)

**Spec coverage.** §3.1 layout: `src/api/custom-fields.ts` ✓ (Task 5), `src/api/crm/funnels.ts` ✓ (the first CRM client, Task 5), `src/tools/custom-fields.ts` ✓ (Task 7). §3.3 toolsets: `custom-fields` ✓ (Task 7); the default grows by no tool ✓. §3.4: one client method per operation class with a scope parameter and an exhaustive dispatch ✓ (Task 5 `routingOf`, `transferRoute`); every delete tool gated ✓; descriptions front-loaded ✓. §4 kinds table: custom field ✓ (uuid, list, four scopes, `name`), option from the field's inline list with no call ✓ (`pickOption`), funnel ✓ — with the opaque-id fallback the design reserved for the case the live ids are not UUIDs, which they are not. §4.1 data flow: resolve all then write ✓ (every tool resolves scope, field and option before the call); cache invalidation after every write ✓. §5: contract test block deleted ✓ (Task 4); per-layer tests ✓ (Tasks 5–8); live smoke ✓ (Task 9). §6: README table, `notYetImplemented` shrinks, FOLLOWUPS updated ✓.

**Deviations from the design, on purpose.** (1) `Resolver.find`/`list` return the whole entry — the design's resolver returns ids only; field tools need options and settings, so an id-only kind would have forced every tool to load the list again. (2) Board scope is derived from the board's tasks — the design assumed each scope has a list; the API has none for boards. (3) `GET /crm/funnels` is implemented in Phase 3 — the funnel scope needs it. (4) The funnel id shape is `opaque`, not uuid — a live fact. All four are stated in the plan's facts section and in the FOLLOWUPS entry.

**Placeholder scan.** No TBD/TODO; every code step carries its code; "similar to" is not used — the shared normaliser change in Task 2 is spelled out per file.

**Type consistency.** `FieldScope` kinds (`global | project | board | funnel`) match `fieldScopes` (Task 5) and `parseFieldScope`'s switch (Task 7). `TransferTarget = Exclude<FieldScope, { kind: "funnel" }>` matches `transferTargetKinds` and `parseTransferTarget`. `ResolveScope.fieldScope` (Task 6) is what `findField`, `weeek_list_custom_fields`, `weeek_move_custom_field` and `buildNewTask` pass. `Resolver.pickEntry` (Task 6) is what `pickField`/`pickOption` (Task 7) call. `client.tasks.getFields`/`sampleBoardFields` (Task 5) are what `weeek_update_task` (Task 8) and `CustomFieldsApi.list` (Task 5) call. `buildTaskPatch({ resolver, input, taskFields })` is called only from the tool (Task 8). `resolveMembers` moved in Task 2 is what `field-values.ts` imports in Task 8. `FetchStub`/`Mock<FetchStub>` (Task 1) is what Task 2's `removeComment` test uses.

**Review Focus coverage.** 1 → Task 8 (`encodeTaskFields` unknown option with candidates) and Task 7 (`pickOption`). 2 → Task 5 (`list` for board subtracts global and project fields) and Task 7 (`weeek_update_custom_field` unknown field reports candidates and makes no call). 3 → Task 6 (funnel by name, by id, unknown id). 4 → Task 7 (`parsePlacement` both/neither; `weeek_move_custom_field` sends once). 5 → Task 7 (`weeek_update_field_option` keeps the name). 6 → Task 7 (`describe.each` forget sweep) and Task 6 (`forget` drops every field scope).
