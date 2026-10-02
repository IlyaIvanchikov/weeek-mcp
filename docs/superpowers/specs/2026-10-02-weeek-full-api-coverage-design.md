# WEEEK full public-API coverage — design

**Status:** draft for review · **Date:** 2026-10-02 · **Repo:** `weeek-mcp` (npm `weeek-mcp-smart`, today 0.4.4)

## 1. Purpose

Make `weeek-mcp-smart` a complete MCP server for the WEEEK public API — every one of its
operations reachable — while keeping what the server is known for: an agent names things
("project Marketing", "funnel Sales") and the server resolves the ids. Audience is public:
npm, Glama, the MCP registry.

**Success looks like**

- Every operation in WEEEK's public OpenAPI spec (157 today, 16 tags) has a typed, tested
  client method, and a test proves that mechanically.
- Every operation is reachable through an MCP tool; every tool that references a project,
  board, column, member, tag, portfolio, custom field, funnel, status, deal, organization or
  contact accepts its **name or its id**.
- The default install still exposes a small tool surface (Glama scores "3–15 tools" as ideal;
  the server has 5/5 there today), so existing users see no change and the score holds.
- A spec refresh that adds or removes an endpoint fails CI until the code follows.

**Decisions taken in brainstorming**

| Question | Decision |
|---|---|
| Who is it for | Public audience; full mirror of the API, CRM included |
| Names or ids in new tools | **Names everywhere**, ids pass through |
| How to build 157 operations | **Hand-written**, with the vendored spec as a contract test — not code generation |
| How to expose 157 operations | **Toolsets** (GitHub MCP pattern), default = today's task surface |
| Sequencing | Ship the uncommitted `get-attachment` work first as 0.4.5; then four phases, each its own release |

## 2. Facts this design rests on

Verified during brainstorming; sources noted so a reader can re-check.

- **The spec is machine-readable.** `developers.weeek.net` is a Zudoku SPA, but it ships the
  full OpenAPI 3.1.1 document as a lazy JS chunk (`/assets/weeek.yaml-<hash>.js`, referenced
  from `/assets/entry.client-<hash>.js`). Importing that chunk in Node yields the `schema`
  object. Method: FOLLOWUPS #17.
- **Inventory (2026-10-02):** 157 operations. Task manager 48 (tasks 25, projects 17 incl.
  custom fields, boards 15 incl. custom fields, columns 5, portfolios 5, tags 5, workspace 2,
  user 1, attachments 1); custom-field admin is the same CRUD repeated for four scopes
  (global 10, project 10, board 10, funnel 8); CRM 71 (funnels 13, statuses 5, deals 21,
  organizations 18, contacts 13, currencies 1).
- **The spec moved since August.** Task comments (`GET/POST/DELETE /tm/tasks/{taskId}/comments`)
  and assignees (`POST/DELETE /tm/tasks/{taskId}/assignees`) now exist. FOLLOWUPS #15 and #16
  are stale and get re-verified live in Phase 2.
- **Server-side search exists only on** tasks, portfolios, deals (per status), organizations,
  contacts (`search=` + `limit`/`offset`). Everything else is a flat, small, workspace-scoped
  list with no filter.
- **Deals have no workspace-wide list.** `GET /crm/statuses/{statusId}/deals` is the only way
  in. A deal can only be found through its funnel (→ statuses) or its status.
- **Id shapes differ per resource** (from `components.schemas`): integer — workspace, tag,
  portfolio, project, board, column, task, comment, currency; `string:uuid` — member, custom
  field, custom-field option, time entry, attachment, organization (+ address/email/phone),
  contact (+ email/phone); plain `string` with no declared format — funnel, status, deal.
- **Name fields differ too:** `name` for most; `title` for workspace, tag, task, deal; a joined
  `firstName middleName lastName` for members and contacts; the value itself for an
  organization's or contact's address / email / phone.
- **Tool-count cost is real, not estimated.** Our 13 tools serialise to 6,721 bytes
  (≈1.7k tokens) in `tools/list`; at that average 157 tools would be ≈81 KB ≈ 20k tokens on
  every request. Glama's score page for this server reads: *"Tool Count: 5/5 – 12 tools within
  ideal 3-15 range."*
- **Grouped "action" tools are not viable.** Probed on `@modelcontextprotocol/sdk` 1.29.0: a
  `z.discriminatedUnion` input is accepted and validates calls correctly, but the wire
  `inputSchema` comes out as `{"type":"object","properties":{}}` — the model sees no
  parameters at all.
- **Toolsets are the ecosystem answer.** GitHub's official MCP server exposes `--toolsets` /
  `GITHUB_TOOLSETS`, a small default set and an `all` value, because *"enabling only the
  toolsets that you need can help the LLM with tool choice and reduce the context size."*
- No tool-count limit is documented by Cursor; Claude Code offers tool search for large sets.
  So `all` is usable — it just must not be the default.

## 3. Architecture

### 3.1 Layout

```
spec/weeek-openapi.json        vendored snapshot of the API spec — test data, not shipped
scripts/refresh-spec.mjs       re-extracts the snapshot from developers.weeek.net

src/http.ts                    HttpClient: bearer auth, timeout, JSON + binary, error mapping,
                               path-param substitution with URL-encoding (today's request())
src/operations.ts              operation registry — constants; the single source of truth
src/api/types.ts               wire types only (Task, Project, Deal, Contact, …)
src/api/tasks.ts               TasksApi — one method per task operation
src/api/projects.ts            ProjectsApi · boards.ts · columns.ts · portfolios.ts · tags.ts ·
                               workspace.ts · user.ts · attachments.ts
src/api/custom-fields.ts       CustomFieldsApi — one method per operation, parametrised by scope
src/api/crm/*.ts               FunnelsApi, StatusesApi, DealsApi, OrganizationsApi,
                               ContactsApi, CurrenciesApi
src/client.ts                  WeeekClient = { tasks, projects, boards, columns, portfolios, tags,
                               workspace, user, attachments, customFields,
                               crm: { funnels, statuses, deals, organizations, contacts, currencies } }
src/resolver.ts                Resolver — one generic resolve + the kinds table
src/cache.ts                   NameCache (unchanged)
src/toolsets.ts                closed set of toolset names → register function; the default
src/tools/core.ts              weeek_version — always registered
src/tools/tasks.ts             the `tasks` toolset (today's reads.ts + writes.ts fold in here)
src/tools/projects.ts          the `projects` toolset
src/tools/custom-fields.ts     the `custom-fields` toolset
src/tools/crm.ts               the `crm` toolset
src/config.ts                  + WEEEK_TOOLSETS
tests/                         mirrors src/ one-to-one; tests/contract.test.ts is the oracle
```

Why a facade over resource clients: 157 methods cannot live in one class readably. The
`client.projects.list()` shape is what mature SDKs use (Octokit `octokit.rest.issues.create`,
Stripe `stripe.customers.list`). The class is internal to the server — no external consumer —
so `client.listProjects()` → `client.projects.list()` is a plain refactor; MCP tool names do
not change.

### 3.2 Operation registry

`src/operations.ts` exports a closed, nested map of operation keys to `{ method, path }`:

```ts
export const operations = {
  tasks: {
    list:       { method: "GET",    path: "/tm/tasks" },
    addComment: { method: "POST",   path: "/tm/tasks/{taskId}/comments" },
    …
  },
  crm: { deals: { listByStatus: { method: "GET", path: "/crm/statuses/{statusId}/deals" }, … } },
} as const;
```

`HttpClient.execute(operation, { params, query, body })` is the only way to reach the API; it
substitutes `{param}` placeholders from `params` with `encodeURIComponent`. Path-parameter
*names* are ours — the spec is inconsistent (`{id}`, `{task_id}`, `{taskId}` for the same
thing) — so the contract test compares templates with placeholders normalised.

### 3.3 Toolsets

`WEEEK_TOOLSETS` — comma-separated, validated at boot by `config.ts` against a closed set;
an unknown name is a startup error naming the valid values.

| Toolset | Contents | Default |
|---|---|---|
| `tasks` | tasks (CRUD, move, complete, attachments, comments, timers, time entries, watchers, assignees, locations, parent), members | **yes** |
| `projects` | projects, boards, columns, portfolios, tags, workspace |  |
| `custom-fields` | custom fields and options for all four scopes |  |
| `crm` | funnels, statuses, deals, organizations, contacts, currencies |  |
| `all` | every toolset |  |

`weeek_version` is registered regardless. The default toolset is today's surface plus the task
operations the API gained, so an existing install sees additive change only. Expected size of
the default: 18–20 tools. That may move Glama's tool-count criterion from 5/5 to 4/5; if it
does, the fix is to carve `time` (timers + time entries) into its own toolset — a one-line
change in `toolsets.ts`, decided on the score, not now.

### 3.4 Tool naming and shape

- Names stay `weeek_<verb>_<noun>`: `weeek_list_deals`, `weeek_create_deal`,
  `weeek_update_funnel_status`. Verb pairs the API splits (complete / un-complete, archive /
  un-archive) stay one tool with a boolean, as `weeek_complete_task` does today; add / remove
  pairs (watchers, assignees, locations, tags on a deal) are separate tools — two intents, two
  names.
- Every reference field is `nameOrId` (`string | number`) and resolves per §4.
- **Custom fields:** 38 operations, ~10 tools. The client keeps one method per operation
  (the registry requires it); each tool takes `scope: "global" | "project" | "board" |
  "funnel"` plus the matching owner name, and its handler dispatches exhaustively (a `never`
  check on the fallthrough). The tool is the I/O boundary that narrows the enum.
- **Destructive operations** — every delete, archive, detach — require `confirm: true`
  (a `z.literal(true)`) and carry `annotations.destructiveHint`. Today only
  `weeek_delete_task` does this; it becomes the rule (~25 tools).
- Descriptions are hand-written and front-loaded: what it does, when to use it versus a
  neighbour, side effects, parameter meaning beyond the schema — the six dimensions Glama
  grades.

## 4. Name resolution

One generic `resolve({ kind, value, scope? })` replaces today's four near-identical methods.
A closed **kinds table** drives it; each kind declares its id shape, loading strategy, scope,
and name field.

| Kind | Id shape | Strategy | Scope | Name |
|---|---|---|---|---|
| project, portfolio, tag, currency | integer | list | — | `name` / `title` |
| member | uuid | list | — | first + middle + last |
| funnel | string (format undeclared) | list | — | `name` |
| board | integer | list | project | `name` |
| column | integer | list | board, or project → all its boards | `name` |
| status | string (undeclared) | list | funnel | `name` |
| custom field | uuid | list | global · project · board · funnel | `name` |
| custom-field option | uuid | from the field's inline `options[]` — no call | custom field | `name` |
| task | integer | **search** | — | `title` |
| organization, contact | uuid | **search** | — | `name` / first + middle + last |
| deal | string (undeclared) | **search** | funnel (→ each status, parallel, concurrency 5) or status | `title` |
| org address / email / phone, contact email / phone | uuid | from the parent's inline arrays — no call | organization / contact | the value |

- **list** — the whole collection, cached under `kind` or `kind:scopeId` for 60 s (today's
  `NameCache`). Only for collections the API gives no filter for; all of them are small and
  workspace-scoped.
- **search** — `?search=<name>&limit=50`; the collection is never paged in full. Cached under
  `kind:scopeId:query`.
- **Id passthrough** per shape: integer kinds on `/^\d+$/`, uuid kinds on the UUID pattern.
  Funnel, status and deal ids are declared as bare `string`; the design assumes they are
  UUID-shaped in practice and verifies that in the Phase 4 live smoke. If they are not, the
  kind's shape becomes `opaque` and its tools gain an explicit `…Id` alternative — a change to
  the table and those schemas, nothing structural.
- **Choosing** is unchanged (`pickUnique`): exactly one case-insensitive exact match wins;
  otherwise `ResolutionError` with candidates — the exact duplicates, or up to five substring
  matches. Never auto-picks. Scoped errors name the scope:
  `could not resolve status "Negotiation" in funnel "Sales"; candidates: …`.
- **Deals require context by schema.** Every deal tool's zod shape requires `funnel` or
  `status` alongside `deal`; a reference without either is rejected before any call.

### 4.1 Data flow of a write tool

1. zod parses the input (reference fields are `nameOrId`).
2. Resolve everything, in dependency order (funnel → status; then assignee / contact /
   organization in parallel).
3. A pure builder (`buildCreateDealBody(resolver, input)`) returns the typed request body.
   Builders are unit-tested without MCP, like today's `buildCreateBody`.
4. One API call: `client.crm.deals.create({ statusId, body })`.
5. Reply via `jsonReply`; the tool then invalidates the cache keys its write dirties
   (`cache.invalidate("tags")` after creating a tag). The tool knows what it dirtied; the
   cache and resolver do not learn which tool does what. Today nothing invalidates — create a
   project, reference it by name within 60 s, and resolution fails. This closes that.

Resolve-all-then-write means a bad name never leaves a half-applied change. `moveTask`'s two
sequential POSTs (FOLLOWUPS #6) stay as they are.

### 4.2 Errors

| Situation | Reply |
|---|---|
| Unknown or ambiguous name | `{ error, candidates }` (exists) |
| API non-2xx | `WeeekApiError` with status (exists) |
| Destructive call without `confirm: true` | rejected by the schema |
| Deal reference without funnel / status | rejected by the schema |

## 5. Testing

### 5.1 The contract test

`tests/contract.test.ts` loads `spec/weeek-openapi.json` and `operations` and asserts:

1. every registry entry matches one spec operation — method and path template, placeholders
   normalised;
2. every spec operation is in the registry, except those in an explicit `notYetImplemented`
   array grouped by phase;
3. no operation has two registry entries.

Phase 1 adds the array at full length; each phase deletes its block; Phase 4 deletes the
constant. CI is green throughout and the remaining gap is readable in one place.

### 5.2 Per-layer coverage

| Layer | Each test proves |
|---|---|
| `http.ts` | bearer header; timeout → `WeeekTimeoutError`; JSON vs binary body; non-2xx → `WeeekApiError`; placeholder substitution and URL-encoding |
| `api/*.ts` — one test per method, fake `fetch` | exact method, URL, query and body sent; response normalised to our type |
| `resolver.ts` — per kind | passthrough · unique · unknown → candidates · ambiguous → candidates · scoped · search bounded · cache invalidated after the dirtying write |
| builders | input → body |
| `tools/*.ts` — the existing zod-replaying harness | happy path · error reply · `confirm` gate · `destructiveHint` present |
| `toolsets.ts`, `config.ts` | default is `tasks`; `all` registers everything; unknown toolset fails at boot; a snapshot of tool names per toolset |
| `server.ts` | `buildServer` registers the default toolset's tools (closes FOLLOWUPS #9) |
| tool quality | every name is `weeek_<verb>_<noun>`; every destructive tool has `confirm` + `destructiveHint`; every description is non-empty and bounded |

Fixtures are synthetic JSON shaped by the spec's component schemas. A value used both to build
and to assert is declared once.

### 5.3 What tests cannot prove

Unit tests prove we match the spec; this API has contradicted its spec twice (FOLLOWUPS #15,
#16). Each phase therefore ends with a **live smoke checklist** run through the MCP with the
user's token staying inside the server process: create / read / resolve-by-name / delete once
per new resource. Findings are recorded in FOLLOWUPS. Not automated: there is no token in CI
and there must not be.

## 6. Phases and releases

Each phase is a branch → PR → tag; the tag triggers the publish (existing CI). The default
toolset only grows, so every release is a minor bump.

| Phase | Scope | Release |
|---|---|---|
| 0 | Ship the uncommitted `get-attachment` work as is | 0.4.5 |
| 1 | Vendored spec + `refresh-spec`; registry + `HttpClient`; contract test with the full `notYetImplemented` list; toolsets + `WEEEK_TOOLSETS`; generic resolver; refactor existing client/tools onto the new layout (no tool changes) | 0.5.0 |
| 2 | Task manager: the remaining task ops (comments, timers, time entries, watchers, assignees, locations, parent); projects, boards, columns, portfolios, tags, workspace, user. Re-verify FOLLOWUPS #15/#16 live | 0.6.0 |
| 3 | Custom fields, four scopes | 0.7.0 |
| 4 | CRM; funnel/status/deal id shape verified live | 1.0.0 — the API is complete |

Per phase: README toolset table updated; `notYetImplemented` shrinks; smoke checklist run;
FOLLOWUPS updated. `manifest.json` carries no tool list, so nothing to maintain there.

## 7. Out of scope

- Code generation from the spec (decided against — see §1).
- Pagination helpers beyond what `weeek_list_tasks` already does; list tools expose
  `limit`/`offset` where the API has them.
- A tool for raw arbitrary requests to the API.
- Multi-workspace tokens (the public API scopes a token to one workspace).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Spec ≠ live behaviour (precedent: #15, #16, #18) | live smoke per phase; findings in FOLLOWUPS; tolerant parsing where a shape is in doubt, never silent |
| Funnel/status/deal ids not UUID-shaped | kinds table switches those to `opaque`; tools gain `…Id`; verified in Phase 4 smoke |
| Default toolset grows past Glama's 15 | split out `time` if the score moves |
| Spec chunk hash changes / docs site blocked | `refresh-spec` discovers the hash from the entry chunk each run and documents the VPN/DNS fixes |
| Resolver load on big CRM workspaces | search kinds never page; list kinds are small by construction; deal fan-out capped at 5 concurrent |
