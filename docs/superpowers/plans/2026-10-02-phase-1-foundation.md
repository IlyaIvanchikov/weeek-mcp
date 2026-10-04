# Phase 1 — Foundation for full WEEEK API coverage: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the spec snapshot, operation registry, contract test, HTTP layer, resource-client layout, generic resolver and toolsets in place — with every existing tool behaving exactly as before — so Phases 2–4 can add the remaining 142 operations one resource at a time.

**Architecture:** A vendored OpenAPI snapshot (`spec/weeek-openapi.json`) is compared by a contract test against a closed operation registry (`src/operations.ts`); the registry is the only thing `HttpClient` will execute. `WeeekClient` becomes a facade over resource clients (`src/api/*.ts`), name resolution is driven by a kinds table, and tools are grouped into toolsets selected by `WEEEK_TOOLSETS` (default `tasks`, which is today's surface).

**Tech Stack:** TypeScript 5 (NodeNext ESM, `.js` import suffixes), Node ≥ 18, `@modelcontextprotocol/sdk` ^1.0 (1.29 installed), `zod` ^3.23, `vitest` 2, GitHub Actions (tag-triggered publish).

**Spec:** `docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md`

## Global Constraints

- **Never commit without the user's explicit go-ahead.** Each task ends with a commit step; stop before it, show `git status --short` and the message, and wait. Staging, tests, typecheck and build may run freely.
- **Never `npm publish` by hand.** Pushing a `v*` tag triggers CI, which verifies `package.json` version == tag, publishes to npm and the MCP registry, and attaches the `.mcpb`.
- Node ≥ 18 (`engines`), ESM only, every relative import ends in `.js`.
- Conventional Commits (commitlint): `type(scope): imperative subject`, lowercase, no trailing period.
- English-only code and comments. Match the existing comment density (a sentence of *why* at non-obvious spots, nothing else).
- Tests live in `tests/` and mirror `src/` one-to-one; fixtures are synthetic; a value used both to build and to assert is declared once.
- No token in CI, in tests, or in any log line. The server must still boot and list tools without `WEEEK_API_TOKEN`.
- The MCP tool names and input schemas of all 13 existing tools **do not change** in this phase. The default `tools/list` after Phase 1 is byte-for-byte the list before it, plus nothing.
- `spec/`, `scripts/`, `tests/`, `docs/` are not shipped: `package.json` `files` stays `["dist"]`; add `spec/` to `.mcpbignore` and `.dockerignore`.
- Closed sets get closed types (`as const` + derived union); exhaustive branches end in a `never` check; options objects for ≥ 3 params or same-typed params.
- **Prerequisite:** Phase 0 (the uncommitted `get-attachment` work) is committed and released as 0.4.5 first; this plan branches from `main` after that merge as `feat/phase-1-foundation`.

## Review Focus

1. **A name with `/`, a space or Cyrillic reaching a path.** `GET /tm/tasks/{taskId}` is fed from resolved ids today, but Phase 2 feeds search terms into paths and queries; `fillPath` must `encodeURIComponent` every substitution and refuse a missing parameter. → test in Task 4.
2. **`WEEEK_TOOLSETS=" tasks , ALL,,tasks"`.** Whitespace, case, empty segments and duplicates must normalise, not crash or double-register (the SDK throws on a duplicate tool name). → tests in Task 8.
3. **`all` next to a named toolset.** `all,tasks` must register each tool exactly once. → test in Task 8.
4. **The spec's inconsistent parameter names.** `{id}`, `{task_id}`, `{taskId}` for the same thing — the contract test must treat `/tm/tasks/{id}` and `/tm/tasks/{taskId}` as the same operation, or every registry path is "missing". → test in Task 3.
5. **An operation implemented but left in `notYetImplemented`.** The list would silently rot; the test must fail when an operation is in both the registry and the list. → test in Task 3.

---

## File structure after Phase 1

```
spec/weeek-openapi.json           vendored snapshot (Task 1)
scripts/refresh-spec.mjs          re-extracts the snapshot (Task 1)
src/operations.ts                 registry + listOperations() (Task 2)
src/http.ts                       HttpClient + fillPath (Task 4)
src/api/constants.ts              attachmentServices (Task 5)
src/api/types.ts                  wire types (Task 5)
src/api/shared.ts                 pickArray, toNamed, toMember mappers (Task 5)
src/api/tasks.ts                  TasksApi (Task 5)
src/api/projects.ts · boards.ts · columns.ts · workspace.ts · attachments.ts   (Task 6)
src/client.ts                     WeeekClient facade (Task 6)
src/resolver.ts                   kinds table + generic resolve (Task 7)
src/toolsets.ts                   toolset names, default, registerToolsets (Task 8)
src/tools/core.ts                 weeek_version (Task 8)
src/tools/tasks.ts                the tasks toolset = reads.ts + writes.ts merged (Task 8)
src/tools/reply.ts                unchanged
src/config.ts                     + toolsets (Task 8)
src/server.ts                     uses registerToolsets (Task 8)
tests/spec.test.ts · operations.test.ts · contract.test.ts · http.test.ts
tests/api/{tasks,projects,boards,columns,workspace,attachments}.test.ts
tests/client.test.ts (facade wiring) · resolver.test.ts · toolsets.test.ts · config.test.ts · server.test.ts
tests/tools/{core,tasks}.test.ts · tool-quality.test.ts
```

Deleted at the end of Phase 1: `src/tools/reads.ts`, `src/tools/writes.ts`, `tests/reads.test.ts`, `tests/writes.test.ts` (their contents move, they do not vanish).

---

### Task 1: Vendor the spec snapshot and the script that refreshes it

**Files:**
- Create: `scripts/refresh-spec.mjs`
- Create: `spec/weeek-openapi.json` (generated by the script)
- Create: `tests/spec.test.ts`
- Modify: `.mcpbignore`, `.dockerignore` (add `spec/`)
- Modify: `package.json` (add script `"refresh-spec": "node scripts/refresh-spec.mjs"`)

**Interfaces:**
- Produces: `spec/weeek-openapi.json` — an OpenAPI 3.1 document with `openapi`, `info`, `servers`, `tags`, `paths`, `components.schemas`, `components.securitySchemes`. Shared schemas appear once under `components.schemas`; every other use is `{ "$ref": "#/components/schemas/<Name>" }`. Task 3 reads `paths`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/spec.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(new URL("../spec/weeek-openapi.json", import.meta.url), "utf8"));

describe("spec snapshot", () => {
  it("is an OpenAPI 3.1 document for the production API", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.servers).toEqual([{ url: "https://api.weeek.net/public/v1", description: "Production" }]);
  });

  it("holds the operations as paths with HTTP-method keys", () => {
    const methods = new Set(["get", "post", "put", "patch", "delete"]);
    const paths = Object.entries(spec.paths) as Array<[string, Record<string, unknown>]>;
    expect(paths.length).toBeGreaterThan(50);
    for (const [path, item] of paths) {
      expect(path.startsWith("/")).toBe(true);
      expect(Object.keys(item).some((k) => methods.has(k))).toBe(true);
    }
  });

  it("stores shared schemas once and references them", () => {
    expect(Object.keys(spec.components.schemas)).toContain("Attachment");
    const text = JSON.stringify(spec.paths);
    expect(text).toContain('"$ref":"#/components/schemas/Attachment"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/spec.test.ts`
Expected: FAIL — `ENOENT … spec/weeek-openapi.json`

- [ ] **Step 3: Write the refresh script**

```js
#!/usr/bin/env node
// scripts/refresh-spec.mjs
//
// Re-extract WEEEK's public OpenAPI spec into spec/weeek-openapi.json.
//
// WHY THIS EXISTS: developers.weeek.net is a client-rendered docs site. Every HTML path
// returns the same shell, so the spec cannot be fetched as a file. It IS shipped to the
// browser, though — as a JavaScript chunk the docs app lazy-loads. This script follows the
// same chain the browser does:
//   1. GET /                       → find the entry script  /assets/entry.client-<hash>.js
//   2. GET that script             → find the spec chunk    weeek.yaml-<hash>.js
//   3. import() the spec chunk     → it `export`s the resolved `schema` object
//   4. write it back as plain JSON, turning shared schema objects into $ref links
//
// Usage:   npm run refresh-spec
// Then:    npx vitest run tests/contract.test.ts   — fails for every new or removed operation
//
// WHEN IT FAILS
//   "fetch failed" / ENOTFOUND  → DNS. On the office VPN the weeek.net zone is black-holed;
//                                 fix: resolvectl domain wlo1 IGD_BELTELECOM '~weeek.net' && resolvectl flush-caches
//                                 (re-run after every Wi-Fi reconnect).
//   connect timeout on the docs host → the tunnel blocks it; set REFRESH_SPEC_INTERFACE=wlo1
//                                 to bind the request past the VPN (curl's --interface; node
//                                 has no equivalent, so the script shells out to curl then).
//   "entry script not found" / "spec chunk not found" → the docs app changed its layout.
//                                 Open developers.weeek.net in a browser, Network tab, find the
//                                 chunk whose name contains "weeek.yaml", and update the regexes.
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DOCS = "https://developers.weeek.net";
const OUT = new URL("../spec/weeek-openapi.json", import.meta.url);
const iface = process.env.REFRESH_SPEC_INTERFACE;

async function fetchText(url) {
  if (!iface) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.text();
  }
  const { stdout } = await promisify(execFile)("curl", ["-sS", "--interface", iface, "--max-time", "60", url], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

const landing = await fetchText(`${DOCS}/`);
const entry = landing.match(/src="(\/assets\/entry\.client-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error("entry script not found in the landing page");

const entryJs = await fetchText(`${DOCS}${entry}`);
const chunk = entryJs.match(/weeek\.yaml-[A-Za-z0-9_-]+\.js/)?.[0];
if (!chunk) throw new Error("spec chunk not found in the entry script");

const chunkJs = await fetchText(`${DOCS}/assets/${chunk}`);
const tmp = join(tmpdir(), `weeek-spec-${Date.now()}.mjs`);
await writeFile(tmp, chunkJs);
const { schema } = await import(pathToFileURL(tmp).href);

// The chunk resolves every $ref into a shared object graph (recursive where the spec is).
// Walk it back to JSON: a schema object is written in full once, under components.schemas,
// and as a $ref everywhere else. The chunk tags each one with a non-enumerable `__$ref`.
const definitions = schema.components?.schemas ?? {};
const definitionSite = new Map(Object.entries(definitions).map(([name, obj]) => [obj, `#/components/schemas/${name}`]));
function toPlain(node, atDefinition = false) {
  if (Array.isArray(node)) return node.map((n) => toPlain(n));
  if (!node || typeof node !== "object") return node;
  const ref = definitionSite.get(node) ?? node.__$ref;
  if (ref && !atDefinition) return { $ref: ref };
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, toPlain(v)]));
}

const document = {
  openapi: schema.openapi,
  info: schema.info,
  servers: schema.servers,
  tags: schema.tags,
  paths: toPlain(schema.paths),
  components: {
    schemas: Object.fromEntries(Object.entries(definitions).map(([n, o]) => [n, toPlain(o, true)])),
    securitySchemes: schema.components?.securitySchemes,
  },
};

await mkdir(new URL("../spec/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(document, null, 2) + "\n");
const operations = Object.values(document.paths).reduce(
  (n, item) => n + Object.keys(item).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).length, 0);
console.log(`wrote ${OUT.pathname}: openapi ${document.openapi}, ${Object.keys(document.paths).length} paths, ${operations} operations, ${Object.keys(document.components.schemas).length} schemas (from ${chunk})`);
```

- [ ] **Step 4: Add the npm script and the ignore entries, then run it**

In `package.json` `scripts` add `"refresh-spec": "node scripts/refresh-spec.mjs"`.
Append `spec/` as a new line to both `.mcpbignore` and `.dockerignore`.

Run: `npm run refresh-spec` (add `REFRESH_SPEC_INTERFACE=wlo1` in front if it times out)
Expected: `wrote …/spec/weeek-openapi.json: openapi 3.1.1, 99 paths, 157 operations, 35 schemas (from weeek.yaml-….js)`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/spec.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add scripts/refresh-spec.mjs spec/weeek-openapi.json tests/spec.test.ts package.json .mcpbignore .dockerignore
git commit -m "chore(spec): vendor the WEEEK OpenAPI snapshot and add refresh-spec"
```

---

### Task 2: The operation registry

**Files:**
- Create: `src/operations.ts`
- Test: `tests/operations.test.ts`

**Interfaces:**
- Produces:
  - `httpMethods: readonly ["GET","POST","PUT","PATCH","DELETE"]`, `type HttpMethod`
  - `interface Operation { readonly method: HttpMethod; readonly path: string }`
  - `operations` — nested `as const` object: `operations.tasks.get`, `operations.workspace.listMembers`, …
  - `listOperations(): Operation[]` — every leaf, flattened (Task 3 and Task 4 consume this and the leaves).

- [ ] **Step 1: Write the failing test**

```ts
// tests/operations.test.ts
import { describe, it, expect } from "vitest";
import { operations, listOperations, httpMethods } from "../src/operations.js";

describe("operation registry", () => {
  it("lists every leaf exactly once", () => {
    const all = listOperations();
    expect(all.length).toBe(15);
    const keys = all.map((o) => `${o.method} ${o.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses only known HTTP methods and absolute API paths", () => {
    for (const op of listOperations()) {
      expect(httpMethods).toContain(op.method);
      expect(op.path.startsWith("/")).toBe(true);
    }
  });

  it("names path parameters in camelCase so callers can pass them as object keys", () => {
    expect(operations.tasks.get.path).toBe("/tm/tasks/{taskId}");
    expect(operations.attachments.get.path).toBe("/ws/attachments/{fileId}");
    for (const op of listOperations()) {
      for (const param of op.path.match(/\{[^}]+\}/g) ?? []) expect(param).toMatch(/^\{[a-z][A-Za-z0-9]*\}$/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/operations.test.ts`
Expected: FAIL — `Cannot find module '../src/operations.js'`

- [ ] **Step 3: Write the registry**

```ts
// src/operations.ts
//
// Every WEEEK API operation the server can call, as data. HttpClient executes an entry
// from this map and nothing else, and tests/contract.test.ts compares the map with the
// vendored spec in both directions — so an endpoint cannot be called without being
// registered, and cannot be registered if the spec does not have it.
//
// Path parameters are named by us, in camelCase ({taskId}); the spec is inconsistent
// ({id}, {task_id}, {taskId}) and the contract test normalises placeholders before comparing.

export const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export interface Operation {
  readonly method: HttpMethod;
  readonly path: string;
}

export const operations = {
  workspace: {
    listMembers: { method: "GET", path: "/ws/members" },
  },
  projects: {
    list: { method: "GET", path: "/tm/projects" },
  },
  boards: {
    list: { method: "GET", path: "/tm/boards" },
  },
  columns: {
    list: { method: "GET", path: "/tm/board-columns" },
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
  },
  attachments: {
    get: { method: "GET", path: "/ws/attachments/{fileId}" },
  },
} as const satisfies Record<string, Record<string, Operation>>;

export function listOperations(): Operation[] {
  return Object.values(operations).flatMap((group) => Object.values(group) as Operation[]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/operations.test.ts && npm run typecheck`
Expected: PASS (3 tests); typecheck clean

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/operations.ts tests/operations.test.ts
git commit -m "refactor(api): introduce the operation registry"
```

---

### Task 3: The contract test — registry ↔ spec

**Files:**
- Create: `tests/contract.test.ts`

**Interfaces:**
- Consumes: `listOperations()` from Task 2; `spec/weeek-openapi.json` from Task 1.
- Produces: `notYetImplemented` — the list later phases shrink. Each phase deletes its block; Phase 4 deletes the constant and the `filter` that uses it.

- [ ] **Step 1: Write the test (it must pass immediately for the 15 registered operations and fail the moment a registered operation is missing from the spec or listed below)**

```ts
// tests/contract.test.ts
//
// The oracle for "all endpoints": the registry in src/operations.ts must match the vendored
// spec in both directions. Placeholders are normalised because the spec names the same
// parameter {id}, {task_id} or {taskId} depending on the endpoint, and ours are camelCase.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { listOperations } from "../src/operations.js";

const spec = JSON.parse(readFileSync(new URL("../spec/weeek-openapi.json", import.meta.url), "utf8"));
const methods = ["get", "post", "put", "patch", "delete"] as const;

const normalise = (method: string, path: string) => `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{}")}`;

const specOperations = new Set<string>();
for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
  for (const m of methods) if (item[m]) specOperations.add(normalise(m, path));
}
const registered = new Set(listOperations().map((o) => normalise(o.method, o.path)));

// Operations the spec has and the server does not call yet, by phase. Delete a block when
// its phase lands; delete the constant in Phase 4. An operation in BOTH this list and the
// registry fails the test below, so the list cannot rot.
const notYetImplemented: string[] = [
  // ── Phase 2 · task manager ──────────────────────────────────────────────
  "GET /user/me",
  "GET /ws",
  "GET /ws/tags", "POST /ws/tags", "GET /ws/tags/{}", "PUT /ws/tags/{}", "DELETE /ws/tags/{}",
  "GET /tm/portfolios", "POST /tm/portfolios", "GET /tm/portfolios/{}", "PUT /tm/portfolios/{}", "DELETE /tm/portfolios/{}",
  "POST /tm/projects", "GET /tm/projects/{}", "PUT /tm/projects/{}", "DELETE /tm/projects/{}",
  "POST /tm/projects/{}/archive", "POST /tm/projects/{}/un-archive",
  "POST /tm/boards", "PUT /tm/boards/{}", "DELETE /tm/boards/{}", "POST /tm/boards/{}/move",
  "POST /tm/board-columns", "PUT /tm/board-columns/{}", "DELETE /tm/board-columns/{}", "POST /tm/board-columns/{}/move",
  "POST /tm/tasks/{}/locations", "DELETE /tm/tasks/{}/locations",
  "POST /tm/tasks/{}/watchers", "DELETE /tm/tasks/{}/watchers",
  "POST /tm/tasks/{}/start-timer", "POST /tm/tasks/{}/stop-timer",
  "POST /tm/tasks/{}/time-entries", "PUT /tm/tasks/{}/time-entries/{}", "DELETE /tm/tasks/{}/time-entries/{}",
  "POST /tm/tasks/{}/assignees", "DELETE /tm/tasks/{}/assignees",
  "POST /tm/tasks/{}/parent",
  "GET /tm/tasks/{}/comments", "POST /tm/tasks/{}/comments", "DELETE /tm/tasks/{}/comments/{}",
  // ── Phase 3 · custom fields (global, project, board, funnel) ────────────
  "GET /tm/custom-fields", "POST /tm/custom-fields", "PUT /tm/custom-fields/{}", "DELETE /tm/custom-fields/{}",
  "POST /tm/custom-fields/{}/transfer-to-project", "POST /tm/custom-fields/{}/transfer-to-board",
  "POST /tm/custom-fields/{}/options", "PUT /tm/custom-fields/{}/options/{}", "DELETE /tm/custom-fields/{}/options/{}", "POST /tm/custom-fields/{}/options/{}/move",
  "POST /tm/projects/{}/custom-fields", "PUT /tm/projects/{}/custom-fields/{}", "DELETE /tm/projects/{}/custom-fields/{}",
  "POST /tm/projects/{}/custom-fields/{}/transfer-to-task-manager", "POST /tm/projects/{}/custom-fields/{}/transfer-to-project", "POST /tm/projects/{}/custom-fields/{}/transfer-to-board",
  "POST /tm/projects/{}/custom-fields/{}/options", "PUT /tm/projects/{}/custom-fields/{}/options/{}", "DELETE /tm/projects/{}/custom-fields/{}/options/{}", "POST /tm/projects/{}/custom-fields/{}/options/{}/move",
  "POST /tm/boards/{}/custom-fields", "PUT /tm/boards/{}/custom-fields/{}", "DELETE /tm/boards/{}/custom-fields/{}",
  "POST /tm/boards/{}/custom-fields/{}/transfer-to-task-manager", "POST /tm/boards/{}/custom-fields/{}/transfer-to-project", "POST /tm/boards/{}/custom-fields/{}/transfer-to-board",
  "POST /tm/boards/{}/custom-fields/{}/options", "PUT /tm/boards/{}/custom-fields/{}/options/{}", "DELETE /tm/boards/{}/custom-fields/{}/options/{}", "POST /tm/boards/{}/custom-fields/{}/options/{}/move",
  "POST /crm/funnels/{}/custom-fields", "PUT /crm/funnels/{}/custom-fields/{}", "DELETE /crm/funnels/{}/custom-fields/{}", "POST /crm/funnels/{}/custom-fields/{}/move",
  "POST /crm/funnels/{}/custom-fields/{}/options", "PUT /crm/funnels/{}/custom-fields/{}/options/{}", "DELETE /crm/funnels/{}/custom-fields/{}/options/{}", "POST /crm/funnels/{}/custom-fields/{}/options/{}/move",
  // ── Phase 4 · CRM ───────────────────────────────────────────────────────
  "GET /crm/funnels", "POST /crm/funnels", "GET /crm/funnels/{}", "PUT /crm/funnels/{}", "DELETE /crm/funnels/{}",
  "GET /crm/funnels/{}/statuses", "POST /crm/funnels/{}/statuses", "GET /crm/statuses/{}", "PUT /crm/statuses/{}", "DELETE /crm/statuses/{}",
  "GET /crm/statuses/{}/deals", "POST /crm/statuses/{}/deals",
  "GET /crm/deals/{}", "PUT /crm/deals/{}", "PATCH /crm/deals/{}", "DELETE /crm/deals/{}",
  "POST /crm/deals/{}/move", "PUT /crm/deals/{}/funnel", "PUT /crm/deals/{}/status",
  "POST /crm/deals/{}/assignees", "DELETE /crm/deals/{}/assignees",
  "POST /crm/deals/{}/contacts", "DELETE /crm/deals/{}/contacts",
  "POST /crm/deals/{}/organizations", "DELETE /crm/deals/{}/organizations",
  "POST /crm/deals/{}/tags", "DELETE /crm/deals/{}/tags",
  "POST /crm/deals/{}/tasks", "POST /crm/deals/{}/tasks/{}/move", "DELETE /crm/deals/{}/tasks/{}",
  "POST /crm/deals/{}/attachments",
  "GET /crm/organizations", "POST /crm/organizations", "GET /crm/organizations/{}", "PUT /crm/organizations/{}", "DELETE /crm/organizations/{}",
  "POST /crm/organizations/{}/addresses", "PUT /crm/organizations/{}/addresses/{}", "DELETE /crm/organizations/{}/addresses/{}",
  "POST /crm/organizations/{}/emails", "PUT /crm/organizations/{}/emails/{}", "DELETE /crm/organizations/{}/emails/{}",
  "POST /crm/organizations/{}/phones", "PUT /crm/organizations/{}/phones/{}", "DELETE /crm/organizations/{}/phones/{}",
  "POST /crm/organizations/{}/contacts", "DELETE /crm/organizations/{}/contacts",
  "POST /crm/organizations/{}/tags", "DELETE /crm/organizations/{}/tags",
  "GET /crm/currencies",
  "GET /crm/contacts", "POST /crm/contacts", "GET /crm/contacts/{}", "PUT /crm/contacts/{}", "DELETE /crm/contacts/{}",
  "POST /crm/contacts/{}/emails", "PUT /crm/contacts/{}/emails/{}", "DELETE /crm/contacts/{}/emails/{}",
  "POST /crm/contacts/{}/phones", "PUT /crm/contacts/{}/phones/{}", "DELETE /crm/contacts/{}/phones/{}",
  "POST /crm/contacts/{}/tags", "DELETE /crm/contacts/{}/tags",
];

describe("API contract", () => {
  it("registers only operations the spec has", () => {
    const unknown = [...registered].filter((k) => !specOperations.has(k));
    expect(unknown, "registered but not in spec/weeek-openapi.json — typo, or the API dropped it").toEqual([]);
  });

  it("covers every spec operation, except those explicitly deferred", () => {
    const deferred = new Set(notYetImplemented);
    const missing = [...specOperations].filter((k) => !registered.has(k) && !deferred.has(k));
    expect(missing, "in the spec, not registered, not deferred — run `npm run refresh-spec`? then implement or defer").toEqual([]);
  });

  it("does not list a deferred operation that is already implemented", () => {
    const stale = notYetImplemented.filter((k) => registered.has(k));
    expect(stale, "implemented — remove from notYetImplemented").toEqual([]);
  });

  it("defers only operations that exist in the spec", () => {
    const phantom = notYetImplemented.filter((k) => !specOperations.has(k));
    expect(phantom, "deferred but the spec has no such operation").toEqual([]);
  });

  it("treats differently named path parameters as the same operation", () => {
    expect(normalise("get", "/tm/tasks/{id}")).toBe(normalise("GET", "/tm/tasks/{taskId}"));
  });

  it("accounts for every operation: registered + deferred = spec", () => {
    expect(registered.size + notYetImplemented.length).toBe(specOperations.size);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/contract.test.ts`
Expected: PASS (6 tests). If "covers every spec operation" fails, the spec snapshot differs from the 2026-10-02 inventory — add the new keys to the matching phase block; if "defers only operations that exist" fails, the API dropped an endpoint — remove it from the list and note it in `docs/FOLLOWUPS.md`.

- [ ] **Step 3: Prove the test can fail (then revert)**

Temporarily change `complete: { method: "POST", path: "/tm/tasks/{taskId}/complete" }` in `src/operations.ts` to `path: "/tm/tasks/{taskId}/completed"`.
Run: `npx vitest run tests/contract.test.ts`
Expected: FAIL in "registers only operations the spec has" listing `POST /tm/tasks/{}/completed`, and in "covers every spec operation" listing `POST /tm/tasks/{}/complete`.
Revert the change; run again; expect PASS.

- [ ] **Step 4: Commit (after go-ahead)**

```bash
git add tests/contract.test.ts
git commit -m "test: add the spec contract test with the deferred-operation list"
```

---

### Task 4: `HttpClient` — execute a registry operation

**Files:**
- Create: `src/http.ts`
- Test: `tests/http.test.ts`

`src/client.ts` is **not** touched in this task; its `request()` keeps working until Task 6 deletes it. The new class is proven in isolation first.

**Interfaces:**
- Consumes: `Operation` from `src/operations.ts`; `Config` from `src/config.ts`; errors from `src/errors.ts`.
- Produces:
  - `type Query = Record<string, string | number | boolean | undefined>`
  - `type PathParams = Record<string, string | number>`
  - `interface ExecuteOptions { params?: PathParams; query?: Query; body?: unknown }`
  - `interface BinaryResponse { bytes: Uint8Array; contentType: string }`
  - `fillPath(template: string, params?: PathParams): string` — substitutes `{name}` with `encodeURIComponent(params[name])`; throws on a missing parameter.
  - `class HttpClient { constructor(cfg: Config, fetchImpl?: typeof fetch); get origin(): string; execute<T>(operation: Operation, opts?: ExecuteOptions): Promise<T>; download(url: URL): Promise<BinaryResponse> }`
  - `download` sends **no credentials** (attachment URLs are pre-signed), uses `redirect: "manual"`, follows exactly one redirect and only to `https`, and reports a transport failure as `could not reach <host> (<undici cause code>) …` with a VPN hint. Verified live 2026-10-04: WEEEK answers `303` to an S3 host; see FOLLOWUPS #17.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/http.test.ts
import { describe, it, expect, vi } from "vitest";
import { HttpClient, fillPath } from "../src/http.js";

const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024 };
const auth = { Authorization: "Bearer " + "t".repeat(24) };

function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
function binaryFetch(status: number, bytes: Uint8Array, contentType: string) {
  return vi.fn(async () => new Response(bytes as unknown as BodyInit, { status, headers: { "content-type": contentType } }));
}
const op = { method: "GET", path: "/tm/tasks/{taskId}" } as const;

describe("fillPath", () => {
  it("substitutes and URL-encodes every parameter", () => {
    expect(fillPath("/tm/tasks/{taskId}/comments/{commentId}", { taskId: 7, commentId: "a b/c" })).toBe("/tm/tasks/7/comments/a%20b%2Fc");
  });
  it("encodes non-ASCII so a resolved name can never break the path", () => {
    expect(fillPath("/x/{name}", { name: "Маркетинг" })).toBe("/x/%D0%9C%D0%B0%D1%80%D0%BA%D0%B5%D1%82%D0%B8%D0%BD%D0%B3");
  });
  it("throws when a parameter is missing instead of sending a literal {taskId}", () => {
    expect(() => fillPath("/tm/tasks/{taskId}", {})).toThrow(/missing path parameter "taskId"/);
  });
});

describe("HttpClient.execute", () => {
  it("builds the URL from base + filled path + query, sends the bearer and a JSON content-type", async () => {
    const f = jsonFetch(200, { success: true, task: { id: 7 } });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    const out = await http.execute<{ task: { id: number } }>(op, { params: { taskId: 7 }, query: { perPage: 20, skip: undefined, completed: false } });
    expect(out.task.id).toBe(7);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks/7?perPage=20&completed=false");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).headers).toMatchObject({ ...auth, "content-type": "application/json" });
  });

  it("serialises an object body as JSON", async () => {
    const f = jsonFetch(200, { success: true });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await http.execute({ method: "POST", path: "/tm/tasks" }, { body: { title: "T" } });
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ title: "T" });
  });

  it("sends FormData as-is, without a JSON content-type", async () => {
    const f = jsonFetch(200, { success: true });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    const form = new FormData();
    form.append("files[]", new Blob([new Uint8Array([1])]), "f.bin");
    await http.execute({ method: "POST", path: "/tm/tasks/{taskId}/attachments" }, { params: { taskId: 1 }, body: form });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty("content-type");
  });

  it("throws WeeekAuthError without calling fetch when there is no token", async () => {
    const f = jsonFetch(200, {});
    const http = new HttpClient({ ...cfg, token: undefined }, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekAuthError" });
    expect(f).not.toHaveBeenCalled();
  });

  it("maps a non-2xx to WeeekApiError with the status and the API message", async () => {
    const f = jsonFetch(404, { success: false, message: "nope" });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekApiError", status: 404, message: "nope" });
  });

  it("maps an aborted request to WeeekTimeoutError", async () => {
    const f = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const http = new HttpClient({ ...cfg, timeoutMs: 5 }, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekTimeoutError" });
  });
});

describe("HttpClient.download", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const storage = "https://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1?X-Amz-Signature=s";
  function redirectThen(location: string, status = 200) {
    return vi.fn()
      .mockImplementationOnce(async () => new Response(null, { status: 303, headers: { location } }))
      .mockImplementationOnce(async () => new Response(png as unknown as BodyInit, { status, headers: { "content-type": "image/png" } }));
  }

  it("downloads a directly served file with no credentials and no automatic redirect", async () => {
    const f = binaryFetch(200, png, "image/png");
    const out = await new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/ws/1/files/a?expires=1&signature=x"));
    expect(out.contentType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.headers ?? {}).not.toHaveProperty("Authorization");
    expect(init.redirect).toBe("manual");
  });

  it("follows exactly one redirect to an https host, still without credentials", async () => {
    const f = redirectThen(storage);
    const out = await new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/ws/1/files/a?expires=1&signature=x"));
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1][0])).toBe(storage);
    expect((f.mock.calls[1][1] as RequestInit).headers ?? {}).not.toHaveProperty("Authorization");
  });

  it("refuses a redirect to a non-https location", async () => {
    const f = redirectThen("http://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1");
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a"))).rejects.toThrow(/https/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refuses a second redirect", async () => {
    const f = redirectThen("https://storage.example/one", 302);
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a"))).rejects.toThrow(/redirect/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("names the unreachable host and undici's cause code when the transport fails", async () => {
    const f = vi.fn()
      .mockImplementationOnce(async () => new Response(null, { status: 303, headers: { location: storage } }))
      .mockImplementationOnce(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }); });
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a")))
      .rejects.toThrow(/prod-private\.s3\.ru-1\.storage\.selcloud\.ru.*UND_ERR_CONNECT_TIMEOUT.*VPN/s);
  });

  it("maps a non-2xx download to WeeekApiError", async () => {
    const f = binaryFetch(403, new Uint8Array(), "text/plain");
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a"))).rejects.toMatchObject({ name: "WeeekApiError", status: 403 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/http.test.ts`
Expected: FAIL — `Cannot find module '../src/http.js'`

- [ ] **Step 3: Write `src/http.ts`**

```ts
// src/http.ts
import type { Config } from "./config.js";
import type { Operation } from "./operations.js";
import { WeeekApiError, WeeekAuthError, WeeekTimeoutError } from "./errors.js";

export type Query = Record<string, string | number | boolean | undefined>;
export type PathParams = Record<string, string | number>;
export interface ExecuteOptions { params?: PathParams; query?: Query; body?: unknown; }
export interface BinaryResponse { bytes: Uint8Array; contentType: string; }

/**
 * Fill `{name}` placeholders. Values are URL-encoded because they can be anything the
 * model passed through — a resolved id today, a search term tomorrow — and a missing
 * parameter is a programming error, so it throws instead of sending a literal "{taskId}".
 */
export function fillPath(template: string, params: PathParams = {}): string {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path parameter "${name}" for ${template}`);
    return encodeURIComponent(String(value));
  });
}

export class HttpClient {
  constructor(private cfg: Config, private fetchImpl: typeof fetch = fetch) {}

  get origin(): string {
    return new URL(this.cfg.baseUrl).origin;
  }

  async execute<T>(operation: Operation, opts: ExecuteOptions = {}): Promise<T> {
    // Tools are listed without a token; the token is required only once a tool actually
    // calls the API. Fail clearly here instead of sending an unauthenticated request.
    if (!this.cfg.token) throw new WeeekAuthError();
    const url = new URL(this.cfg.baseUrl + fillPath(operation.path, opts.params));
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    // Multipart bodies must NOT get a JSON content-type — fetch sets the boundary itself.
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.token}` };
    if (!isForm) headers["content-type"] = "application/json";
    const res = await this.send(url, {
      method: operation.method,
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new WeeekApiError(String(json.message ?? "WEEEK API error"), res.status, `http_${res.status}`);
    }
    return json as T;
  }

  /**
   * Download a pre-signed URL. No credentials are sent — not to WEEEK, not to the storage
   * host it redirects to — and the redirect is followed by hand, once, only to https, so
   * where the bytes come from is decided here rather than by fetch's redirect policy.
   */
  async download(url: URL): Promise<BinaryResponse> {
    let res = await this.sendUnauthenticated(url);
    if (HttpClient.isRedirect(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`${url.host} redirected without a location`);
      const target = new URL(location, url);
      if (target.protocol !== "https:") throw new Error(`refusing a redirect to non-https ${target.origin}`);
      res = await this.sendUnauthenticated(target);
      if (HttpClient.isRedirect(res.status)) throw new Error(`${target.host} answered with another redirect; only one is followed`);
    }
    if (!res.ok) throw new WeeekApiError("download failed", res.status, `http_${res.status}`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  private static isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  // "fetch failed" alone has cost real debugging time (a VPN routed the storage host into a
  // black hole), so a transport failure names the host and undici's cause code.
  private async sendUnauthenticated(url: URL): Promise<Response> {
    try {
      return await this.send(url, { method: "GET", redirect: "manual" });
    } catch (err) {
      if (err instanceof WeeekTimeoutError) throw err;
      const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err instanceof Error ? err.message : String(err));
      throw new Error(`could not reach ${url.host} (${cause}); if you are on a VPN, the storage host may be routed through it`);
    }
  }

  private async send(url: URL, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: ctrl.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new WeeekTimeoutError();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/http.test.ts && npm run typecheck`
Expected: PASS (15 tests); typecheck clean

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/http.ts tests/http.test.ts
git commit -m "refactor(api): add HttpClient that executes registry operations"
```

---

### Task 5: Resource clients under `src/api/`

**Files:**
- Create: `src/api/constants.ts`, `src/api/types.ts`, `src/api/shared.ts`
- Create: `src/api/tasks.ts`, `src/api/projects.ts`, `src/api/boards.ts`, `src/api/columns.ts`, `src/api/workspace.ts`, `src/api/attachments.ts`
- Test: `tests/api/helpers.ts`, `tests/api/tasks.test.ts`, `tests/api/projects.test.ts`, `tests/api/boards.test.ts`, `tests/api/columns.test.ts`, `tests/api/workspace.test.ts`, `tests/api/attachments.test.ts`

`src/client.ts` is still untouched here (Task 6 swaps it). The types below are copies of the ones in `client.ts` for one commit; Task 6 deletes the originals.

**Interfaces:**
- Consumes: `HttpClient`, `Query` (Task 4); `operations` (Task 2).
- Produces (all exported):
  - `api/constants.ts`: `attachmentServices = ["weeek","google_drive","dropbox","one_drive","box"] as const`
  - `api/types.ts`: `NamedEntity {id:number;name:string}`, `Member {id:string;name:string}`, `AttachmentService`, `Attachment`, `AttachmentBytes`, `WeeekTask` (incl. `attachments: Attachment[]`), `CreateTaskBody`, `DownloadAttachmentOptions {attachment; maxBytes}`
  - `api/shared.ts`: `pickArray(obj, key): unknown[]`, `toNamed(raw): NamedEntity`, `toMember(raw): Member`
  - `TasksApi`: `list(query: Query)`, `create(body: CreateTaskBody)`, `get(id: number)`, `update(id: number, patch: Record<string, unknown>)`, `remove(id: number): Promise<{success:boolean}>`, `setCompleted({ id, completed })`, `move({ id, boardId, boardColumnId })`, `uploadAttachment({ id, filename, data }): Promise<Attachment[]>`
  - `ProjectsApi.list(): Promise<NamedEntity[]>` · `BoardsApi.list(projectId: number)` · `ColumnsApi.list(boardId: number)` · `WorkspaceApi.listMembers(): Promise<Member[]>`
  - `AttachmentsApi`: `get(id: string): Promise<Attachment>`, `download({ attachment, maxBytes }): Promise<AttachmentBytes>`

- [ ] **Step 1: Write the shared test helper and the failing tests**

```ts
// tests/api/helpers.ts
import { vi } from "vitest";
import { HttpClient } from "../../src/http.js";

export const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024 };
export const bearer = "Bearer " + "t".repeat(24);

export function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
export function binaryFetch(status: number, bytes: Uint8Array, contentType: string) {
  return vi.fn(async () => new Response(bytes as unknown as BodyInit, { status, headers: { "content-type": contentType } }));
}
export function httpWith(f: ReturnType<typeof vi.fn>) {
  return new HttpClient(cfg, f as unknown as typeof fetch);
}
export function sent(f: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = f.mock.calls[call] as [URL, RequestInit];
  return { url: String(url), init, json: () => JSON.parse(init.body as string) };
}
```

```ts
// tests/api/tasks.test.ts
import { describe, it, expect } from "vitest";
import { TasksApi } from "../../src/api/tasks.js";
import { jsonFetch, httpWith, sent } from "./helpers.js";

const rawTask = { id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8, assignees: ["a2318d51-uuid"], dueDate: "2026-07-22", isCompleted: false };

describe("TasksApi", () => {
  it("list GETs /tm/tasks with the query and normalises each task", async () => {
    const f = jsonFetch(200, { success: true, tasks: [rawTask] });
    const out = await new TasksApi(httpWith(f)).list({ projectId: 2, perPage: 20 });
    expect(out).toEqual([{ id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8, assignees: ["a2318d51-uuid"], dueDate: "2026-07-22", completed: false, attachments: [] }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks?projectId=2&perPage=20");
  });

  it("create POSTs title + locations and optional fields only when given", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, id: 5 } });
    const t = await new TasksApi(httpWith(f)).create({ title: "T", projectId: 1, boardColumnId: 2, userId: "u1", dayFrom: "2026-08-01" });
    expect(t.id).toBe(5);
    const { url, init, json } = sent(f);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks");
    expect(init.method).toBe("POST");
    expect(json()).toEqual({ title: "T", locations: [{ projectId: 1, boardColumnId: 2 }], userId: "u1", dayFrom: "2026-08-01" });
  });

  it("get surfaces assignees, boardId, dueDate and attachments", async () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "m.png", url: "https://api.weeek.net/f/1", size: 10, createdAt: "2026-08-01T10:00:00Z" };
    const f = jsonFetch(200, { success: true, task: { ...rawTask, attachments: [att] } });
    const t = await new TasksApi(httpWith(f)).get(78);
    expect(t.attachments).toEqual([att]);
    expect(t.boardId).toBe(3);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
  });

  it("get defaults assignees and attachments to [] when absent", async () => {
    const f = jsonFetch(200, { success: true, task: { id: 1, title: "T" } });
    const t = await new TasksApi(httpWith(f)).get(1);
    expect(t.assignees).toEqual([]);
    expect(t.attachments).toEqual([]);
    expect(t.boardId).toBeNull();
  });

  it("update PUTs the patch", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).update(78, { title: "New" });
    const { url, init, json } = sent(f);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
    expect(init.method).toBe("PUT");
    expect(json()).toEqual({ title: "New" });
  });

  it("remove DELETEs and returns the success envelope", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new TasksApi(httpWith(f)).remove(9)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/9");
  });

  it("setCompleted posts to /complete or /un-complete, then re-reads the task", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, isCompleted: true } });
    const t = await new TasksApi(httpWith(f)).setCompleted({ id: 78, completed: true });
    expect(t.completed).toBe(true);
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/complete");
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).setCompleted({ id: 78, completed: false });
    expect(sent(g, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/un-complete");
  });

  it("move posts board then board-column, then fetches the task", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).move({ id: 7, boardId: 3, boardColumnId: 4 });
    expect(f.mock.calls.length).toBe(3);
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/board");
    expect(sent(f, 0).json()).toEqual({ boardId: 3 });
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/board-column");
    expect(sent(f, 1).json()).toEqual({ boardColumnId: 4 });
    expect(sent(f, 2).url).toBe("https://api.weeek.net/public/v1/tm/tasks/7");
  });

  it("uploadAttachment posts multipart files[] and returns the attachments as a list — object or array shape", async () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "f.md", url: "http://x", size: 3, createdAt: "2026-08-01T10:00:00Z" };
    const single = jsonFetch(200, { success: true, data: att });
    expect(await new TasksApi(httpWith(single)).uploadAttachment({ id: 7, filename: "f.md", data: new Uint8Array([1, 2, 3]) })).toEqual([att]);
    const { url, init } = sent(single);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/attachments");
    expect(init.body).toBeInstanceOf(FormData);
    expect(((init.body as FormData).get("files[]") as File).name).toBe("f.md");
    expect(init.headers).not.toHaveProperty("content-type");
    const list = jsonFetch(200, { success: true, data: [att] });
    expect(await new TasksApi(httpWith(list)).uploadAttachment({ id: 7, filename: "f.md", data: new Uint8Array([1]) })).toEqual([att]);
  });
});
```

```ts
// tests/api/projects.test.ts
import { describe, it, expect } from "vitest";
import { ProjectsApi } from "../../src/api/projects.js";
import { jsonFetch, httpWith, sent, bearer } from "./helpers.js";

describe("ProjectsApi", () => {
  it("list GETs /tm/projects with the bearer and normalises to {id,name}", async () => {
    const f = jsonFetch(200, { success: true, projects: [{ id: 1, name: "Marketing" }] });
    expect(await new ProjectsApi(httpWith(f)).list()).toEqual([{ id: 1, name: "Marketing" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/projects");
    expect(sent(f).init.headers).toMatchObject({ Authorization: bearer });
  });
});
```

```ts
// tests/api/boards.test.ts
import { describe, it, expect } from "vitest";
import { BoardsApi } from "../../src/api/boards.js";
import { jsonFetch, httpWith, sent } from "./helpers.js";

describe("BoardsApi", () => {
  it("list GETs /tm/boards?projectId=…", async () => {
    const f = jsonFetch(200, { success: true, boards: [{ id: 10, name: "Main" }] });
    expect(await new BoardsApi(httpWith(f)).list(2)).toEqual([{ id: 10, name: "Main" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/boards?projectId=2");
  });
});
```

```ts
// tests/api/columns.test.ts
import { describe, it, expect } from "vitest";
import { ColumnsApi } from "../../src/api/columns.js";
import { jsonFetch, httpWith, sent } from "./helpers.js";

describe("ColumnsApi", () => {
  it("list GETs /tm/board-columns?boardId=…", async () => {
    const f = jsonFetch(200, { success: true, boardColumns: [{ id: 100, name: "Done" }] });
    expect(await new ColumnsApi(httpWith(f)).list(10)).toEqual([{ id: 100, name: "Done" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/board-columns?boardId=10");
  });
});
```

```ts
// tests/api/workspace.test.ts
import { describe, it, expect } from "vitest";
import { WorkspaceApi } from "../../src/api/workspace.js";
import { jsonFetch, httpWith, sent } from "./helpers.js";

describe("WorkspaceApi", () => {
  it("listMembers GETs /ws/members and joins first + last name", async () => {
    const f = jsonFetch(200, { success: true, members: [{ id: "u9", firstName: "Ilya", lastName: "I" }, { id: "u2", email: "x@y.z" }] });
    expect(await new WorkspaceApi(httpWith(f)).listMembers()).toEqual([{ id: "u9", name: "Ilya I" }, { id: "u2", name: "x@y.z" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/ws/members");
  });
});
```

```ts
// tests/api/attachments.test.ts
import { describe, it, expect } from "vitest";
import { AttachmentsApi } from "../../src/api/attachments.js";
import { jsonFetch, binaryFetch, httpWith, sent } from "./helpers.js";

const weeekFile = (over: Record<string, unknown> = {}) => ({
  id: "a1", creatorId: "u1", service: "weeek" as const, name: "modules.png",
  url: "https://api.weeek.net/ws/1005494/files/a1?sig=x", size: 4, createdAt: "2026-08-01T10:00:00Z", ...over,
});

describe("AttachmentsApi", () => {
  it("get GETs /ws/attachments/{id} and returns the data envelope", async () => {
    const att = weeekFile();
    const f = jsonFetch(200, { success: true, data: att });
    expect(await new AttachmentsApi(httpWith(f)).get(att.id)).toEqual(att);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/ws/attachments/a1");
  });

  it("download fetches the pre-signed url without credentials and returns bytes + content-type", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const f = binaryFetch(200, png, "image/png");
    const attachment = weeekFile({ size: png.length });
    const out = await new AttachmentsApi(httpWith(f)).download({ attachment, maxBytes: 1024 });
    expect(out.contentType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    expect(sent(f).url).toBe(attachment.url);
    expect(sent(f).init.headers ?? {}).not.toHaveProperty("Authorization");
  });

  it("download refuses an attachment stored in an external service", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    const attachment = weeekFile({ service: "google_drive", url: "https://drive.google.com/file/a1", size: undefined });
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment, maxBytes: 1024 })).rejects.toThrow(/google_drive/);
    expect(f).not.toHaveBeenCalled();
  });

  it("download refuses a url outside the API origin", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    const attachment = weeekFile({ url: "https://evil.example.com/steal" });
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment, maxBytes: 1024 })).rejects.toThrow(/origin/);
    expect(f).not.toHaveBeenCalled();
  });

  it("download refuses a declared size over maxBytes without fetching", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile({ size: 5000 }), maxBytes: 1024 })).rejects.toThrow(/too large/);
    expect(f).not.toHaveBeenCalled();
  });

  it("download refuses a body over maxBytes even when size was absent", async () => {
    const f = binaryFetch(200, new Uint8Array(2048), "image/png");
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile({ size: undefined }), maxBytes: 1024 })).rejects.toThrow(/too large/);
    expect(f).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/api`
Expected: FAIL in every file — `Cannot find module '../../src/api/…'`

- [ ] **Step 3: Write the api layer**

```ts
// src/api/constants.ts
// WEEEK stores an attachment either itself ("weeek") or in a third-party drive. The set is
// closed, so it is a closed type: a new service must fail the type check wherever it is read.
export const attachmentServices = ["weeek", "google_drive", "dropbox", "one_drive", "box"] as const;
```

```ts
// src/api/types.ts
import type { attachmentServices } from "./constants.js";

export interface NamedEntity { id: number; name: string; }
export interface Member { id: string; name: string; }

export type AttachmentService = (typeof attachmentServices)[number];

export interface Attachment {
  id: string;
  creatorId: string;
  service: AttachmentService;
  name: string;
  /** Temporary URL. When `service` is "weeek" it is valid for one hour. */
  url: string;
  /** Present only when `service` is "weeek". */
  size?: number;
  createdAt: string;
}

export interface AttachmentBytes { bytes: Uint8Array; contentType: string; }
export interface DownloadAttachmentOptions { attachment: Attachment; maxBytes: number; }

export interface WeeekTask {
  id: number; title: string; description: string | null;
  projectId: number | null; boardId: number | null; boardColumnId: number | null;
  assignees: string[]; dueDate: string | null; completed: boolean;
  attachments: Attachment[];
}

export interface CreateTaskBody {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
}
```

```ts
// src/api/shared.ts
import type { NamedEntity, Member } from "./types.js";

/** The API wraps lists under a resource-specific key; fall back to the first array present. */
export function pickArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (Array.isArray(v)) return v;
  for (const value of Object.values(obj)) if (Array.isArray(value)) return value;
  return [];
}

export function toNamed(raw: any): NamedEntity {
  const name = raw.name ?? raw.title ?? [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
  return { id: Number(raw.id), name: String(name ?? "") };
}

export function toMember(raw: any): Member {
  const joined = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
  const name = joined || raw.name || raw.email || String(raw.id ?? "");
  return { id: String(raw.id ?? ""), name: String(name) };
}
```

```ts
// src/api/tasks.ts
import type { HttpClient, Query } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./shared.js";
import type { Attachment, CreateTaskBody, WeeekTask } from "./types.js";

export interface SetCompletedOptions { id: number; completed: boolean; }
export interface MoveTaskOptions { id: number; boardId: number; boardColumnId: number; }
export interface UploadAttachmentOptions { id: number; filename: string; data: Uint8Array | Blob; }

const ops = operations.tasks;

function toTask(raw: any): WeeekTask {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    description: raw.description ?? null,
    projectId: raw.projectId == null ? null : Number(raw.projectId),
    boardId: raw.boardId == null ? null : Number(raw.boardId),
    boardColumnId: raw.boardColumnId == null ? null : Number(raw.boardColumnId),
    // WEEEK assigns the task creator by default; assignees are read-only on this shape.
    assignees: Array.isArray(raw.assignees) ? raw.assignees.map(String) : [],
    dueDate: raw.dueDate == null ? null : String(raw.dueDate),
    completed: Boolean(raw.isCompleted ?? raw.completed ?? false),
    // The API returns these with every task; surfacing them is what lets a caller see a
    // screenshot-only description instead of silently working from the prose.
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as Attachment[]) : [],
  };
}

export class TasksApi {
  constructor(private http: HttpClient) {}

  async list(query: Query): Promise<WeeekTask[]> {
    const j = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    return pickArray(j, "tasks").map(toTask);
  }

  async create(body: CreateTaskBody): Promise<WeeekTask> {
    const location: Record<string, number> = { projectId: body.projectId };
    if (body.boardColumnId !== undefined) location.boardColumnId = body.boardColumnId;
    const payload: Record<string, unknown> = { title: body.title, locations: [location] };
    if (body.description !== undefined) payload.description = body.description;
    if (body.userId !== undefined) payload.userId = body.userId;
    if (body.dayFrom !== undefined) payload.dayFrom = body.dayFrom;
    const j = await this.http.execute<{ task: unknown }>(ops.create, { body: payload });
    return toTask(j.task);
  }

  async get(id: number): Promise<WeeekTask> {
    const j = await this.http.execute<{ task: unknown }>(ops.get, { params: { taskId: id } });
    return toTask(j.task);
  }

  async update(id: number, patch: Record<string, unknown>): Promise<WeeekTask> {
    const j = await this.http.execute<{ task: unknown }>(ops.update, { params: { taskId: id }, body: patch });
    return toTask(j.task);
  }

  async remove(id: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { taskId: id } });
  }

  async setCompleted({ id, completed }: SetCompletedOptions): Promise<WeeekTask> {
    await this.http.execute(completed ? ops.complete : ops.uncomplete, { params: { taskId: id } });
    return this.get(id);
  }

  // Two requests the API does not offer as one; if the second fails the task sits on the
  // new board in its old column (FOLLOWUPS #6).
  async move({ id, boardId, boardColumnId }: MoveTaskOptions): Promise<WeeekTask> {
    await this.http.execute(ops.changeBoard, { params: { taskId: id }, body: { boardId } });
    await this.http.execute(ops.changeColumn, { params: { taskId: id }, body: { boardColumnId } });
    return this.get(id);
  }

  async uploadAttachment({ id, filename, data }: UploadAttachmentOptions): Promise<Attachment[]> {
    const form = new FormData();
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
    form.append("files[]", blob, filename);
    const j = await this.http.execute<{ data?: unknown }>(ops.uploadAttachment, { params: { taskId: id }, body: form });
    // The spec documents `data` as one Attachment; accept a list too — `files[]` is a
    // multipart array and the live shape has not been pinned down (FOLLOWUPS #18).
    if (Array.isArray(j.data)) return j.data as Attachment[];
    return j.data ? [j.data as Attachment] : [];
  }
}
```

```ts
// src/api/projects.ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./shared.js";
import type { NamedEntity } from "./types.js";

export class ProjectsApi {
  constructor(private http: HttpClient) {}
  async list(): Promise<NamedEntity[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.projects.list);
    return pickArray(j, "projects").map(toNamed);
  }
}
```

```ts
// src/api/boards.ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./shared.js";
import type { NamedEntity } from "./types.js";

export class BoardsApi {
  constructor(private http: HttpClient) {}
  async list(projectId: number): Promise<NamedEntity[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.boards.list, { query: { projectId } });
    return pickArray(j, "boards").map(toNamed);
  }
}
```

```ts
// src/api/columns.ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./shared.js";
import type { NamedEntity } from "./types.js";

export class ColumnsApi {
  constructor(private http: HttpClient) {}
  async list(boardId: number): Promise<NamedEntity[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.columns.list, { query: { boardId } });
    return pickArray(j, "boardColumns").map(toNamed);
  }
}
```

```ts
// src/api/workspace.ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toMember } from "./shared.js";
import type { Member } from "./types.js";

export class WorkspaceApi {
  constructor(private http: HttpClient) {}
  async listMembers(): Promise<Member[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.workspace.listMembers);
    return pickArray(j, "members").map(toMember);
  }
}
```

```ts
// src/api/attachments.ts
import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import type { Attachment, AttachmentBytes, DownloadAttachmentOptions } from "./types.js";

export class AttachmentsApi {
  constructor(private http: HttpClient) {}

  async get(id: string): Promise<Attachment> {
    const j = await this.http.execute<{ data?: unknown }>(operations.attachments.get, { params: { fileId: id } });
    return j.data as Attachment;
  }

  /**
   * Fetch an attachment's bytes from the URL its metadata carries.
   *
   * Security: the URL describes a file an untrusted task author uploaded, and for a
   * third-party `service` it points at that vendor's host. So: only weeek-hosted attachments
   * are downloaded at all; the first hop must be the API origin; HttpClient.download sends
   * no credentials and follows one https redirect only; and the size is capped before the
   * request when declared and again on the body — refusing loudly, never truncating.
   */
  async download({ attachment, maxBytes }: DownloadAttachmentOptions): Promise<AttachmentBytes> {
    if (attachment.service !== "weeek") {
      throw new Error(`attachment ${attachment.id} is stored in ${attachment.service}; only weeek-hosted attachments can be downloaded`);
    }
    let url: URL;
    try {
      url = new URL(attachment.url);
    } catch {
      throw new Error(`attachment ${attachment.id} has an unusable url`);
    }
    if (url.origin !== this.http.origin) {
      throw new Error(`attachment ${attachment.id} url origin ${url.origin} is not the WEEEK API origin ${this.http.origin}`);
    }
    if (attachment.size !== undefined && attachment.size > maxBytes) {
      throw new Error(`attachment ${attachment.id} is too large (${attachment.size} > ${maxBytes} bytes)`);
    }
    const { bytes, contentType } = await this.http.download(url);
    if (bytes.byteLength > maxBytes) {
      throw new Error(`attachment ${attachment.id} is too large (${bytes.byteLength} > ${maxBytes} bytes)`);
    }
    return { bytes, contentType };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api && npm run typecheck`
Expected: PASS (15 tests across 6 files); typecheck clean

- [ ] **Step 5: Commit (after go-ahead)**

```bash
git add src/api tests/api
git commit -m "refactor(api): add resource clients for tasks, projects, boards, columns, workspace, attachments"
```

---

### Task 6: `WeeekClient` becomes a facade; every call site moves

**Files:**
- Rewrite: `src/client.ts`
- Modify: `src/resolver.ts`, `src/tools/reads.ts`, `src/tools/writes.ts`
- Rewrite: `tests/client.test.ts`
- Modify: `tests/resolver.test.ts`, `tests/reads.test.ts`, `tests/writes.test.ts` (client stubs become nested)

**Interfaces:**
- Produces: `class WeeekClient { readonly tasks: TasksApi; readonly projects: ProjectsApi; readonly boards: BoardsApi; readonly columns: ColumnsApi; readonly workspace: WorkspaceApi; readonly attachments: AttachmentsApi; constructor(cfg: Config, fetchImpl?: typeof fetch) }` plus `export type * from "./api/types.js"` so `import type { WeeekTask } from "../client.js"` keeps compiling.
- The old flat methods (`listProjects`, `getTask`, …) are **deleted**, not kept as aliases.

- [ ] **Step 1: Write the failing facade test (replace the whole file)**

```ts
// tests/client.test.ts
import { describe, it, expect, vi } from "vitest";
import { WeeekClient } from "../src/client.js";
import { TasksApi } from "../src/api/tasks.js";
import { AttachmentsApi } from "../src/api/attachments.js";

const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024 };

describe("WeeekClient facade", () => {
  it("exposes one resource client per API area", () => {
    const c = new WeeekClient(cfg);
    expect(c.tasks).toBeInstanceOf(TasksApi);
    expect(c.attachments).toBeInstanceOf(AttachmentsApi);
    expect(typeof c.projects.list).toBe("function");
    expect(typeof c.boards.list).toBe("function");
    expect(typeof c.columns.list).toBe("function");
    expect(typeof c.workspace.listMembers).toBe("function");
  });

  it("routes every resource client through the same injected fetch", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true, projects: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    await c.projects.list();
    expect(String(f.mock.calls[0][0])).toBe("https://api.weeek.net/public/v1/tm/projects");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/client.test.ts`
Expected: FAIL — `c.tasks` is undefined (the old class has no namespaces)

- [ ] **Step 3: Rewrite `src/client.ts`**

```ts
// src/client.ts
import type { Config } from "./config.js";
import { HttpClient } from "./http.js";
import { TasksApi } from "./api/tasks.js";
import { ProjectsApi } from "./api/projects.js";
import { BoardsApi } from "./api/boards.js";
import { ColumnsApi } from "./api/columns.js";
import { WorkspaceApi } from "./api/workspace.js";
import { AttachmentsApi } from "./api/attachments.js";

export type * from "./api/types.js";

/**
 * One client per API area, sharing one HttpClient. Resource clients hold the per-endpoint
 * knowledge; this class only wires them, so it stays this size as the API grows.
 */
export class WeeekClient {
  readonly tasks: TasksApi;
  readonly projects: ProjectsApi;
  readonly boards: BoardsApi;
  readonly columns: ColumnsApi;
  readonly workspace: WorkspaceApi;
  readonly attachments: AttachmentsApi;

  constructor(cfg: Config, fetchImpl: typeof fetch = fetch) {
    const http = new HttpClient(cfg, fetchImpl);
    this.tasks = new TasksApi(http);
    this.projects = new ProjectsApi(http);
    this.boards = new BoardsApi(http);
    this.columns = new ColumnsApi(http);
    this.workspace = new WorkspaceApi(http);
    this.attachments = new AttachmentsApi(http);
  }
}
```

- [ ] **Step 4: Move the call sites**

`src/resolver.ts` (Task 7 rewrites this file; for now only the four calls change):
- `this.client.listProjects()` → `this.client.projects.list()`
- `this.client.listBoards(projectId)` → `this.client.boards.list(projectId)`
- `this.client.listColumns(b.id)` / `(boardId)` → `this.client.columns.list(…)`
- `this.client.listMembers()` → `this.client.workspace.listMembers()`

`src/tools/reads.ts`:
- `client.listProjects()` → `client.projects.list()`
- `client.listTasks(query)` / `client.listTasks({ ...query, perPage: args.limit, offset })` → `client.tasks.list(…)` (same arguments)
- `client.getTask(args.id)` → `client.tasks.get(args.id)`
- `client.listMembers()` → `client.workspace.listMembers()`
- `client.getAttachment(args.id)` → `client.attachments.get(args.id)`
- `client.downloadAttachment({ attachment, maxBytes: policy.maxBytes })` → `client.attachments.download({ attachment, maxBytes: policy.maxBytes })`

`src/tools/writes.ts`:
- `client.createTask(body)` → `client.tasks.create(body)` (both places)
- `client.updateTask(args.id, patch)` → `client.tasks.update(args.id, patch)`
- `client.deleteTask(args.id)` → `client.tasks.remove(args.id)`
- `client.attachFile(args.task_id, basename(safePath), data)` → `client.tasks.uploadAttachment({ id: args.task_id, filename: basename(safePath), data })`
- `client.moveTask(args.id, args.board_id, columnId)` → `client.tasks.move({ id: args.id, boardId: args.board_id, boardColumnId: columnId })`
- `client.setCompleted(args.id, args.completed)` → `client.tasks.setCompleted({ id: args.id, completed: args.completed })`

Test stubs — the harnesses pass a plain object as the client, so nest the stubbed methods the same way:

`tests/resolver.test.ts`: every `clientWith({ listProjects: … })` → `clientWith({ projects: { list: … } })`; `listBoards` → `boards: { list }`; `listColumns` → `columns: { list }`; `listMembers` → `workspace: { listMembers }`.

`tests/reads.test.ts`: `harness({ getTask: … })` → `harness({ tasks: { get: … } })`; `listProjects` → `projects: { list }`; `listMembers` → `workspace: { listMembers }`; `listTasks` → `tasks: { list }`; `getAttachment` / `downloadAttachment` → `attachments: { get, download }`.

`tests/writes.test.ts`: in `baseClient`, `listProjects` → `projects: { list }`, `listBoards` → `boards: { list }`, `listColumns` → `columns: { list }`, `listMembers` → `workspace: { listMembers }`; per-test `createTask` → `tasks: { create }`, `updateTask` → `tasks: { update }`, `deleteTask` → `tasks: { remove }`, `attachFile: (id, filename, data) => …` → `tasks: { uploadAttachment: ({ id, filename, data }) => … }`, `moveTask: (id, boardId, columnId) => …` → `tasks: { move: ({ id, boardId, boardColumnId }) => … }`, `setCompleted: (id, completed) => …` → `tasks: { setCompleted: ({ id, completed }) => … }`. Where a test spreads `{ ...baseClient, createTask }`, merge instead: `{ ...baseClient, tasks: { create } }`. Where a test asserted call arguments positionally (e.g. `expect(moveTask).toHaveBeenCalledWith(7, 3, 100)`), assert the options object: `toHaveBeenCalledWith({ id: 7, boardId: 3, boardColumnId: 100 })`.

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npm run typecheck`
Expected: PASS, 0 TypeScript errors. A typecheck error naming `listProjects`/`getTask`/… is a call site you missed — fix it, do not add an alias.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/client.ts src/resolver.ts src/tools/reads.ts src/tools/writes.ts tests/client.test.ts tests/resolver.test.ts tests/reads.test.ts tests/writes.test.ts
git commit -m "refactor(api): split WeeekClient into resource clients behind a facade"
```

---

### Task 7: Generic name resolution driven by a kinds table

**Files:**
- Rewrite: `src/resolver.ts`
- Modify: `src/tools/writes.ts` (four resolver calls)
- Rewrite: `tests/resolver.test.ts`
- Modify: `tests/writes.test.ts` only if a test called `resolveProject` etc. directly (none do today; `buildCreateBody` is exercised through the resolver instance)

**Interfaces:**
- Produces:
  - `idShapes = ["integer", "uuid"] as const`, `type IdShape`
  - `interface ResolveScope { projectId?: number; boardId?: number }`
  - `type KindName = "project" | "board" | "column" | "member"` (grows per phase)
  - `interface ResolveOptions<K extends KindName> { kind: K; value: string | number; scope?: ResolveScope }`
  - `class Resolver { constructor(client: WeeekClient, cache: NameCache); resolve<K extends KindName>(opts: ResolveOptions<K>): Promise<IdOf<K>>; static pickUnique(...) }` — `IdOf<"member">` is `string`, the others `number`.
- Error text is unchanged: the kind's `label` keeps `could not resolve assignee "…"` for members.

- [ ] **Step 1: Write the failing tests (replace the whole file)**

```ts
// tests/resolver.test.ts
import { describe, it, expect, vi } from "vitest";
import { Resolver } from "../src/resolver.js";
import { NameCache } from "../src/cache.js";

function clientWith(over: Record<string, any>) {
  return over as any; // only the resource methods a test needs are provided
}
const freshCache = () => new NameCache(100000, () => 0);
const projects = [{ id: 1, name: "Marketing" }, { id: 2, name: "Sales" }];

describe("Resolver.resolve", () => {
  it("passes an integer id through without calling the API", async () => {
    const list = vi.fn();
    const r = new Resolver(clientWith({ projects: { list } }), freshCache());
    expect(await r.resolve({ kind: "project", value: 42 })).toBe(42);
    expect(await r.resolve({ kind: "project", value: "42" })).toBe(42);
    expect(list).not.toHaveBeenCalled();
  });

  it("passes a UUID through for a uuid-shaped kind", async () => {
    const listMembers = vi.fn();
    const r = new Resolver(clientWith({ workspace: { listMembers } }), freshCache());
    const uuid = "a2318d51-46cd-42a9-bab4-554c80824574";
    expect(await r.resolve({ kind: "member", value: uuid })).toBe(uuid);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("does not treat digits as an id for a uuid-shaped kind", async () => {
    const listMembers = vi.fn(async () => [{ id: "u1", name: "42" }]);
    const r = new Resolver(clientWith({ workspace: { listMembers } }), freshCache());
    expect(await r.resolve({ kind: "member", value: "42" })).toBe("u1");
  });

  it("resolves a unique case-insensitive name", async () => {
    const r = new Resolver(clientWith({ projects: { list: async () => projects } }), freshCache());
    expect(await r.resolve({ kind: "project", value: "marketing" })).toBe(1);
  });

  it("throws with candidates when the name is unknown", async () => {
    const r = new Resolver(clientWith({ projects: { list: async () => projects } }), freshCache());
    await expect(r.resolve({ kind: "project", value: "Markting" })).rejects.toMatchObject({ name: "ResolutionError", kind: "project" });
  });

  it("throws with the duplicates when the name is ambiguous", async () => {
    const r = new Resolver(clientWith({ projects: { list: async () => [{ id: 1, name: "Ops" }, { id: 2, name: "ops" }] } }), freshCache());
    await expect(r.resolve({ kind: "project", value: "Ops" })).rejects.toMatchObject({ name: "ResolutionError", candidates: [{ id: 1, name: "Ops" }, { id: 2, name: "ops" }] });
  });

  it("keeps the user-facing label 'assignee' for members", async () => {
    const r = new Resolver(clientWith({ workspace: { listMembers: async () => [{ id: "u1", name: "Ilya" }] } }), freshCache());
    await expect(r.resolve({ kind: "member", value: "Nobody" })).rejects.toThrow(/could not resolve assignee "Nobody"/);
  });

  it("resolves a board inside its project", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    expect(await r.resolve({ kind: "board", value: "main", scope: { projectId: 1 } })).toBe(10);
    expect(list).toHaveBeenCalledWith(1);
  });

  it("refuses to resolve a scoped kind by name without its scope", async () => {
    const r = new Resolver(clientWith({ boards: { list: async () => [] } }), freshCache());
    await expect(r.resolve({ kind: "board", value: "Main" })).rejects.toThrow(/needs projectId/);
  });

  it("resolves a column across all boards of a project", async () => {
    const client = clientWith({
      boards: { list: async (_pid: number) => [{ id: 10, name: "A" }, { id: 11, name: "B" }] },
      columns: { list: async (bid: number) => bid === 10 ? [{ id: 100, name: "To do" }] : [{ id: 110, name: "Done" }] },
    });
    const r = new Resolver(client, freshCache());
    expect(await r.resolve({ kind: "column", value: "done", scope: { projectId: 1 } })).toBe(110);
  });

  it("resolves a column inside one board when boardId is given", async () => {
    const list = vi.fn(async (_bid: number) => [{ id: 100, name: "In Progress" }]);
    const r = new Resolver(clientWith({ columns: { list } }), freshCache());
    expect(await r.resolve({ kind: "column", value: "in progress", scope: { boardId: 10 } })).toBe(100);
    expect(list).toHaveBeenCalledWith(10);
  });

  it("caches a list per kind and scope", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 2 } });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("resolves a member by full name", async () => {
    const r = new Resolver(clientWith({ workspace: { listMembers: async () => [{ id: "u9", name: "Ilya I" }] } }), freshCache());
    expect(await r.resolve({ kind: "member", value: "ilya i" })).toBe("u9");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/resolver.test.ts`
Expected: FAIL — `r.resolve is not a function`

- [ ] **Step 3: Rewrite `src/resolver.ts`**

```ts
// src/resolver.ts
import type { WeeekClient } from "./client.js";
import type { NameCache } from "./cache.js";
import { ResolutionError, type Candidate } from "./errors.js";

export const idShapes = ["integer", "uuid"] as const;
export type IdShape = (typeof idShapes)[number];

export interface Named<Id extends number | string> { id: Id; name: string; }
export interface ResolveScope { projectId?: number; boardId?: number; }

/** What the resolver needs to know about one kind of named thing. */
interface Kind<Id extends number | string> {
  /** How an id looks, so one can be passed straight through instead of looked up. */
  shape: IdShape;
  /** The word used in error messages — the tool parameter's name, not the API's. */
  label: string;
  /** Cache key; must include every scope id the load depends on. */
  key(scope: ResolveScope): string;
  load(client: WeeekClient, scope: ResolveScope): Promise<Array<Named<Id>>>;
}

interface KindTable {
  project: Kind<number>;
  board: Kind<number>;
  column: Kind<number>;
  member: Kind<string>;
}
export type KindName = keyof KindTable;
type IdOf<K extends KindName> = KindTable[K] extends Kind<infer Id> ? Id : never;

export interface ResolveOptions<K extends KindName> {
  kind: K;
  value: string | number;
  scope?: ResolveScope;
}

const INTEGER_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireScope<T>(value: T | undefined, label: string, field: string): T {
  if (value === undefined) throw new Error(`resolving a ${label} by name needs ${field}`);
  return value;
}

// Only small, workspace-scoped lists belong here (the API has no filter for them). Kinds
// the API can search server-side arrive in later phases with a "search" load.
const kinds: KindTable = {
  project: {
    shape: "integer", label: "project",
    key: () => "projects",
    load: (client) => client.projects.list(),
  },
  board: {
    shape: "integer", label: "board",
    key: (scope) => `boards:${requireScope(scope.projectId, "board", "projectId")}`,
    load: (client, scope) => client.boards.list(requireScope(scope.projectId, "board", "projectId")),
  },
  column: {
    shape: "integer", label: "column",
    key: (scope) => scope.boardId !== undefined
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
    shape: "uuid", label: "assignee",
    key: () => "members",
    load: (client) => client.workspace.listMembers(),
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
    const definition = kinds[kind] as Kind<IdOf<K>>;
    const id = Resolver.asId(definition.shape, value);
    if (id !== null) return id as IdOf<K>;
    const list = await this.cache.get(definition.key(scope), () => definition.load(this.client, scope));
    return Resolver.pickUnique<IdOf<K>>(definition.label, String(value), list);
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

- [ ] **Step 4: Move the four resolver calls in `src/tools/writes.ts`**

- `resolver.resolveProject(input.project)` → `resolver.resolve({ kind: "project", value: input.project })`
- `resolver.resolveColumn(projectId, input.column)` → `resolver.resolve({ kind: "column", value: input.column, scope: { projectId } })`
- `resolver.resolveAssignee(input.assignee)` → `resolver.resolve({ kind: "member", value: input.assignee })`
- `resolver.resolveColumnInBoard(args.board_id, args.column)` → `resolver.resolve({ kind: "column", value: args.column, scope: { boardId: args.board_id } })`

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (resolver: 13 tests); typecheck clean. `ResolutionError.kind` for an assignee is now `"assignee"` (the label) — same text users saw before.

- [ ] **Step 6: Commit (after go-ahead)**

```bash
git add src/resolver.ts src/tools/writes.ts tests/resolver.test.ts
git commit -m "refactor(resolver): drive name resolution from a kinds table"
```

---

### Task 8: Toolsets — `WEEEK_TOOLSETS`, `tasks` default, tools regrouped by toolset

**Files:**
- Create: `src/toolsets.ts`, `src/tools/core.ts`, `src/tools/tasks.ts`
- Modify: `src/config.ts`, `src/server.ts`
- Delete: `src/tools/reads.ts`, `src/tools/writes.ts` (contents move into `src/tools/tasks.ts` and `src/tools/core.ts`)
- Create: `tests/helpers/list-tools.ts`, `tests/toolsets.test.ts`, `tests/tools/core.test.ts`, `tests/tools/tasks.test.ts`
- Modify: `tests/config.test.ts`, `tests/server.test.ts`
- Delete: `tests/reads.test.ts`, `tests/writes.test.ts` (contents move into `tests/tools/tasks.test.ts`)

**Interfaces:**
- Produces:
  - `src/toolsets.ts`: `toolsetNames = ["tasks", "all"] as const` (Phase 2 adds `"projects"`, Phase 3 `"custom-fields"`, Phase 4 `"crm"`), `type ToolsetName`, `defaultToolsets: readonly ToolsetName[] = ["tasks"]`, `interface ToolContext { server: McpServer; client: WeeekClient; resolver: Resolver; cache: NameCache; attachPolicy: AttachPolicy; readPolicy: AttachmentReadPolicy }`, `expandToolsets(selected): Array<Exclude<ToolsetName, "all">>`, `registerToolsets(ctx: ToolContext, selected: readonly ToolsetName[]): void`
  - `src/tools/core.ts`: `registerCoreTools(ctx: ToolContext): void` — `weeek_version`
  - `src/tools/tasks.ts`: `registerTaskTools(ctx: ToolContext): void`, plus the moved exports `MAX_AUTO_PAGES`, `AttachmentReadPolicy`, `buildCreateBody`
  - `src/config.ts`: `Config.toolsets: readonly ToolsetName[]`; `parseToolsets(raw: string | undefined): ToolsetName[]`
  - `tests/helpers/list-tools.ts`: `listTools(server: McpServer): Promise<Tool[]>` — real `tools/list` over an in-memory transport
- `ToolContext.cache` is carried so later phases' write tools can call `cache.invalidate(...)` after creating a named thing; nothing in Phase 1 needs it yet.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/helpers/list-tools.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** The real tools/list a client would receive — what registries and Glama see. */
export async function listTools(server: McpServer) {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return tools;
}
```

```ts
// tests/toolsets.test.ts
import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expandToolsets, registerToolsets, defaultToolsets, toolsetNames } from "../src/toolsets.js";
import { WeeekClient } from "../src/client.js";
import { Resolver } from "../src/resolver.js";
import { NameCache } from "../src/cache.js";
import { listTools } from "./helpers/list-tools.js";

const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024, toolsets: defaultToolsets };

function context() {
  const client = new WeeekClient(cfg);
  const cache = new NameCache(60_000);
  return {
    server: new McpServer({ name: "t", version: "0" }),
    client, cache, resolver: new Resolver(client, cache),
    attachPolicy: { attachDir: "/tmp", maxBytes: 1024 },
    readPolicy: { maxBytes: 1024 },
  };
}

// The exact default surface. A rename or an accidental drop fails here on purpose.
export const defaultToolNames = [
  "weeek_version",
  "weeek_list_projects", "weeek_list_tasks", "weeek_get_task", "weeek_get_attachment", "weeek_list_members",
  "weeek_create_task", "weeek_create_tasks", "weeek_update_task", "weeek_delete_task",
  "weeek_attach_file", "weeek_move_task", "weeek_complete_task",
].sort();

describe("toolsets", () => {
  it("defaults to tasks only", () => {
    expect(defaultToolsets).toEqual(["tasks"]);
    expect(toolsetNames).toContain("all");
  });

  it("expandToolsets turns all into every real toolset and de-duplicates", () => {
    expect(expandToolsets(["all"])).toEqual(["tasks"]);
    expect(expandToolsets(["all", "tasks"])).toEqual(["tasks"]);
    expect(expandToolsets(["tasks", "tasks"])).toEqual(["tasks"]);
  });

  it("registers core + the tasks toolset for the default", async () => {
    const ctx = context();
    registerToolsets(ctx, defaultToolsets);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(defaultToolNames);
  });

  it("registers each tool exactly once for all,tasks", async () => {
    const ctx = context();
    expect(() => registerToolsets(ctx, ["all", "tasks"])).not.toThrow();
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(defaultToolNames);
  });

  it("always registers weeek_version, even for an empty selection", async () => {
    const ctx = context();
    registerToolsets(ctx, []);
    expect((await listTools(ctx.server)).map((t) => t.name)).toEqual(["weeek_version"]);
  });
});
```

Add to `tests/config.test.ts` (keep the three existing tests):

```ts
import { parseToolsets } from "../src/config.js";

describe("WEEEK_TOOLSETS", () => {
  it("defaults to tasks when unset or empty", () => {
    expect(loadConfig({}).toolsets).toEqual(["tasks"]);
    expect(loadConfig({ WEEEK_TOOLSETS: "" }).toolsets).toEqual(["tasks"]);
    expect(loadConfig({ WEEEK_TOOLSETS: " , " }).toolsets).toEqual(["tasks"]);
  });
  it("normalises whitespace, case, empty segments and duplicates", () => {
    expect(parseToolsets(" tasks , ALL,,tasks")).toEqual(["tasks", "all"]);
  });
  it("rejects an unknown toolset and names the valid ones", () => {
    expect(() => loadConfig({ WEEEK_TOOLSETS: "tasks,crm" })).toThrow(/WEEEK_TOOLSETS.*"crm".*tasks, all/);
  });
});
```

Replace `tests/server.test.ts`:

```ts
// tests/server.test.ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { listTools } from "./helpers/list-tools.js";
import { defaultToolNames } from "./toolsets.test.js";

const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 30000, attachMaxBytes: 1024, toolsets: ["tasks"] as const };

describe("buildServer", () => {
  it("registers the default toolset's tools — the list a client actually receives", async () => {
    const names = (await listTools(buildServer(cfg))).map((t) => t.name).sort();
    expect(names).toEqual(defaultToolNames);
  });

  it("boots without a token so registries can list the tools", async () => {
    const names = (await listTools(buildServer({ ...cfg, token: undefined }))).map((t) => t.name);
    expect(names).toContain("weeek_create_task");
  });
});
```

`tests/tools/core.test.ts` — the `weeek_version` test moves here:

```ts
// tests/tools/core.test.ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoreTools } from "../../src/tools/core.js";

describe("core tools", () => {
  it("weeek_version returns the package name and version", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const server = new McpServer({ name: "t", version: "0" });
    const handlers = new Map<string, Function>();
    vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
      handlers.set(name, (raw: unknown) => cb(z.object(config?.inputSchema ?? {}).parse(raw)));
      return undefined as any;
    }) as any);
    registerCoreTools({ server } as any);
    const res = await handlers.get("weeek_version")!({});
    expect(JSON.parse(res.content[0].text)).toEqual({ name: pkg.name, version: pkg.version });
  });
});
```

`tests/tools/tasks.test.ts` — `tests/reads.test.ts` and `tests/writes.test.ts` merge into it. Mechanically:

1. `git mv tests/writes.test.ts tests/tools/tasks.test.ts`.
2. Fix the relative imports (`../src/…` → `../../src/…`), and import `registerTaskTools` from `../../src/tools/tasks.js` instead of `registerWriteTools`.
3. Change the harness to build a `ToolContext`:
   ```ts
   function harness(clientOver: Record<string, any>, attachPolicy = DEFAULT_ATTACH, readPolicy = { maxBytes: 1024 }) {
     const client = clientOver as any;
     const cache = new NameCache(100000, () => 0);
     const resolver = new Resolver(client, cache);
     const server = new McpServer({ name: "t", version: "0" });
     const handlers = new Map<string, Function>();
     vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
       const schema = z.object(config?.inputSchema ?? {});
       handlers.set(name, (rawArgs: unknown) => cb(schema.parse(rawArgs)));
       return undefined as any;
     }) as any);
     registerTaskTools({ server, client, resolver, cache, attachPolicy, readPolicy });
     return handlers;
   }
   ```
4. Append every `it(...)` from `tests/reads.test.ts` **except** the `weeek_version` one (it moved to `core.test.ts`) into the same `describe`, unchanged; where a reads test passed a cap as `harness({...}, 4096)` call it as `harness({...}, DEFAULT_ATTACH, { maxBytes: 4096 })`. Delete the `MAX_AUTO_PAGES` import if nothing uses it, else import it from `../../src/tools/tasks.js`.
5. `git rm tests/reads.test.ts`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/toolsets.test.ts tests/config.test.ts tests/server.test.ts tests/tools`
Expected: FAIL — `Cannot find module '../src/toolsets.js'`, `parseToolsets is not exported`, `Cannot find module '../../src/tools/core.js'`

- [ ] **Step 3: Write `src/tools/core.ts` and `src/tools/tasks.ts`**

```ts
// src/tools/core.ts
import type { ToolContext } from "../toolsets.js";
import { NAME, VERSION } from "../version.js";
import { jsonReply } from "./reply.js";

/** Tools that belong to no toolset and are always present. */
export function registerCoreTools({ server }: ToolContext): void {
  server.registerTool(
    "weeek_version",
    { description: "Return this MCP server's name and version, so callers can check which build is running.", inputSchema: {} },
    async () => jsonReply({ name: NAME, version: VERSION }),
  );
}
```

`src/tools/tasks.ts` is the two existing files joined under one registrar. Build it like this:

1. `git mv src/tools/writes.ts src/tools/tasks.ts`.
2. At the top, add `import type { ToolContext } from "../toolsets.js";` and `import type { WeeekTask } from "../client.js";`, and move these from `reads.ts` into it unchanged: the `MAX_AUTO_PAGES` constant with its comment, the `ATTACHMENT_ID` constant with its comment, and the `AttachmentReadPolicy` interface.
3. Replace the signature
   `export function registerWriteTools(server: McpServer, client: WeeekClient, resolver: Resolver, attachPolicy: AttachPolicy): void {`
   with
   `export function registerTaskTools({ server, client, resolver, attachPolicy, readPolicy }: ToolContext): void {`
   and drop the now-unused `McpServer`, `WeeekClient`, `Resolver` type imports (keep `AttachPolicy` only if still referenced; `CreateTaskBody` stays).
4. Paste the five `server.registerTool(…)` blocks from `reads.ts` — `weeek_list_projects`, `weeek_list_tasks`, `weeek_get_task`, `weeek_get_attachment`, `weeek_list_members` — into the function body, before the write tools, unchanged except `policy.maxBytes` → `readPolicy.maxBytes`. Do **not** paste `weeek_version`.
5. `git rm src/tools/reads.ts`.

- [ ] **Step 4: Write `src/toolsets.ts`**

```ts
// src/toolsets.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient } from "./client.js";
import type { Resolver } from "./resolver.js";
import type { NameCache } from "./cache.js";
import type { AttachPolicy } from "./attach.js";
import { registerCoreTools } from "./tools/core.js";
import { registerTaskTools, type AttachmentReadPolicy } from "./tools/tasks.js";

// Which groups of tools a running server exposes. The default stays small on purpose:
// every tool's schema travels to the model on every request, and registries score the
// count. Pick more with WEEEK_TOOLSETS (comma-separated) or "all". The set grows by one
// per release phase: projects, custom-fields, crm.
export const toolsetNames = ["tasks", "all"] as const;
export type ToolsetName = (typeof toolsetNames)[number];
export const defaultToolsets: readonly ToolsetName[] = ["tasks"];

type RealToolset = Exclude<ToolsetName, "all">;

export interface ToolContext {
  server: McpServer;
  client: WeeekClient;
  resolver: Resolver;
  /** Write tools invalidate the name lists they change; the cache never learns which tool does what. */
  cache: NameCache;
  attachPolicy: AttachPolicy;
  readPolicy: AttachmentReadPolicy;
}

const registrars: Record<RealToolset, (ctx: ToolContext) => void> = {
  tasks: registerTaskTools,
};

export function expandToolsets(selected: readonly ToolsetName[]): RealToolset[] {
  const names = selected.includes("all")
    ? (Object.keys(registrars) as RealToolset[])
    : selected.filter((name): name is RealToolset => name !== "all");
  return [...new Set(names)];
}

export function registerToolsets(ctx: ToolContext, selected: readonly ToolsetName[]): void {
  registerCoreTools(ctx);
  for (const name of expandToolsets(selected)) registrars[name](ctx);
}
```

- [ ] **Step 5: Add `WEEEK_TOOLSETS` to `src/config.ts`**

```ts
import { z } from "zod";
import { toolsetNames, defaultToolsets, type ToolsetName } from "./toolsets.js";

const schema = z.object({
  // …existing fields unchanged…
  // Comma-separated toolset names, or "all". Unset or blank means the default.
  WEEEK_TOOLSETS: z.string().optional(),
});

export interface Config {
  token?: string;
  baseUrl: string;
  timeoutMs: number;
  attachDir?: string;
  attachMaxBytes: number;
  toolsets: readonly ToolsetName[];
}

export function parseToolsets(raw: string | undefined): ToolsetName[] {
  const names = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  if (names.length === 0) return [...defaultToolsets];
  const known: readonly string[] = toolsetNames;
  const unknown = names.find((n) => !known.includes(n));
  if (unknown !== undefined) {
    throw new Error(`invalid config: WEEEK_TOOLSETS: unknown toolset "${unknown}"; valid values: ${toolsetNames.join(", ")}`);
  }
  return [...new Set(names)] as ToolsetName[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid config: ${msg}`);
  }
  return {
    token: parsed.data.WEEEK_API_TOKEN,
    baseUrl: parsed.data.WEEEK_API_BASE_URL,
    timeoutMs: parsed.data.WEEEK_TIMEOUT_MS,
    attachDir: parsed.data.WEEEK_ATTACH_DIR,
    attachMaxBytes: parsed.data.WEEEK_ATTACH_MAX_BYTES,
    toolsets: parseToolsets(parsed.data.WEEEK_TOOLSETS),
  };
}
```

- [ ] **Step 6: Rewrite `src/server.ts`**

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { WeeekClient } from "./client.js";
import { NameCache } from "./cache.js";
import { Resolver } from "./resolver.js";
import { registerToolsets } from "./toolsets.js";
import { NAME, VERSION } from "./version.js";

export function buildServer(config: Config): McpServer {
  const client = new WeeekClient(config);
  const cache = new NameCache(60_000);
  const resolver = new Resolver(client, cache);
  const server = new McpServer({ name: NAME, version: VERSION });
  registerToolsets(
    {
      server, client, resolver, cache,
      // Default the attach jail to the working directory so the tool works with no
      // configuration; WEEEK_ATTACH_DIR overrides it to point/lock it elsewhere.
      attachPolicy: { attachDir: config.attachDir ?? process.cwd(), maxBytes: config.attachMaxBytes },
      readPolicy: { maxBytes: config.attachMaxBytes },
    },
    config.toolsets,
  );
  return server;
}
```

- [ ] **Step 7: Run everything, then prove the default surface did not change**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; 0 errors.

Then compare the real `tools/list` before and after this phase:

```bash
git stash -u && npm run build >/dev/null && node -e '
import("./dist/server.js").then(async ({ buildServer }) => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const s = buildServer({ baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 10485760, toolsets: ["tasks"] });
  const [a, b] = InMemoryTransport.createLinkedPair(); await s.connect(a);
  const c = new Client({ name: "m", version: "0" }); await c.connect(b);
  const { tools } = await c.listTools();
  console.log(JSON.stringify(tools.sort((x, y) => x.name.localeCompare(y.name)), null, 1));
  process.exit(0);
});' > /tmp/claude-1000/-home-ilya-work-AI-weeek-mcp/ff83499e-fb70-4525-bca8-14ea4ce289cb/scratchpad/tools-before.json
git stash pop && npm run build >/dev/null && node -e '…same script…' > /tmp/claude-1000/-home-ilya-work-AI-weeek-mcp/ff83499e-fb70-4525-bca8-14ea4ce289cb/scratchpad/tools-after.json
diff /tmp/claude-1000/-home-ilya-work-AI-weeek-mcp/ff83499e-fb70-4525-bca8-14ea4ce289cb/scratchpad/tools-before.json /tmp/claude-1000/-home-ilya-work-AI-weeek-mcp/ff83499e-fb70-4525-bca8-14ea4ce289cb/scratchpad/tools-after.json && echo "tools/list identical"
```

(The "before" run uses the pre-Task-8 `buildServer`, which ignores `toolsets`; passing it is harmless.) Expected: `tools/list identical`. Any diff is a regression in a tool name, description or schema — fix it.

- [ ] **Step 8: Commit (after go-ahead)**

```bash
git add src/toolsets.ts src/tools src/config.ts src/server.ts tests
git commit -m "feat: add WEEEK_TOOLSETS with a tasks default and regroup tools by toolset"
```

---

### Task 9: Tool-quality test — pin what registries grade

**Files:**
- Create: `tests/tool-quality.test.ts`

**Interfaces:**
- Consumes: `buildServer` (Task 8), `listTools` helper (Task 8).

- [ ] **Step 1: Write the test**

```ts
// tests/tool-quality.test.ts
//
// Encodes the properties Glama's Tool Definition Quality Score grades and the safety rule
// this server promises in its README, so a new tool cannot quietly regress them.
import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../src/server.js";
import { listTools } from "./helpers/list-tools.js";

type Tool = Awaited<ReturnType<typeof listTools>>[number];
let tools: Tool[] = [];

beforeAll(async () => {
  tools = await listTools(buildServer({
    token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024, toolsets: ["all"],
  }));
});

const VERB_NOUN = /^weeek_[a-z]+_[a-z]+(_[a-z]+)*$/;
// The one pre-existing deviation; renaming it would break every installed client.
const namingExceptions = new Set(["weeek_version"]);
const destructiveName = /^weeek_(delete|archive|detach|remove)_/;

const requiresConfirm = (t: Tool) => Array.isArray(t.inputSchema.required) && t.inputSchema.required.includes("confirm");
const isDestructive = (t: Tool) => t.annotations?.destructiveHint === true;

describe("tool quality", () => {
  it("has at least the default surface", () => {
    expect(tools.length).toBeGreaterThanOrEqual(13);
  });

  it("names every tool weeek_<verb>_<noun>", () => {
    const bad = tools.map((t) => t.name).filter((n) => !namingExceptions.has(n) && !VERB_NOUN.test(n));
    expect(bad).toEqual([]);
  });

  it("marks every destructive-named tool destructive and gates it behind confirm:true", () => {
    const unguarded = tools.filter((t) => destructiveName.test(t.name) && !(isDestructive(t) && requiresConfirm(t))).map((t) => t.name);
    expect(unguarded).toEqual([]);
  });

  it("gates every tool that declares destructiveHint behind confirm:true", () => {
    const unguarded = tools.filter((t) => isDestructive(t) && !requiresConfirm(t)).map((t) => t.name);
    expect(unguarded).toEqual([]);
  });

  it("gives every tool a description that says something and stays readable", () => {
    const bad = tools.filter((t) => !t.description || t.description.trim().length < 20 || t.description.length > 600).map((t) => t.name);
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/tool-quality.test.ts`
Expected: PASS (5 tests). If "names every tool" fails, the offending name is listed — rename it, or if it is a shipped tool, add it to `namingExceptions` with a comment saying why it cannot change.

- [ ] **Step 3: Prove it can fail (then revert)**

Temporarily remove `annotations: { destructiveHint: true, idempotentHint: false },` from `weeek_delete_task` in `src/tools/tasks.ts`.
Run: `npx vitest run tests/tool-quality.test.ts`
Expected: FAIL in "marks every destructive-named tool destructive…" listing `weeek_delete_task`. Revert; run again; PASS.

- [ ] **Step 4: Commit (after go-ahead)**

```bash
git add tests/tool-quality.test.ts
git commit -m "test: pin tool naming, destructive-tool guards and description bounds"
```

---

### Task 10: Documentation, follow-ups, release 0.5.0

**Files:**
- Modify: `README.md`, `docs/FOLLOWUPS.md`, `package.json` (version)

- [ ] **Step 1: README — configuration row, Toolsets section, spec-snapshot section**

In the Configuration table add, after `WEEEK_TIMEOUT_MS`:

```markdown
| `WEEEK_TOOLSETS` | no | `tasks` | Comma-separated groups of tools to expose, or `all`. See Toolsets. |
```

Replace the `## Tools` section with:

```markdown
## Toolsets

Every tool's schema is sent to the model on every request, so the server exposes a small
default and lets you opt into more. Set `WEEEK_TOOLSETS` to a comma-separated list, or `all`.

| Toolset | Tools | Default |
|---|---|---|
| `tasks` | `weeek_list_projects`, `weeek_list_tasks`, `weeek_get_task`, `weeek_list_members`, `weeek_get_attachment`, `weeek_create_task`, `weeek_create_tasks`, `weeek_update_task`, `weeek_move_task`, `weeek_complete_task`, `weeek_attach_file`, `weeek_delete_task` | **yes** |
| `all` | every toolset | |

`weeek_version` is always available. More toolsets (`projects`, `custom-fields`, `crm`) arrive in
the next releases; an unknown name is rejected at startup with the list of valid ones.

```bash
WEEEK_TOOLSETS=all npx -y weeek-mcp-smart
```

## Development

### Updating the API spec snapshot

`spec/weeek-openapi.json` is a snapshot of WEEEK's public OpenAPI document. A test
(`tests/contract.test.ts`) checks that every operation the server calls exists in it and that
every operation it declares is either implemented or explicitly deferred — so an API change
shows up as a failing test, not as a surprise in production.

```bash
npm run refresh-spec            # re-extract from developers.weeek.net
npx vitest run tests/contract.test.ts
```

If the refresh fails with a DNS or connection error, read the comment at the top of
`scripts/refresh-spec.mjs` — it lists the known causes (VPN resolver, blocked tunnel) and the
exact fix for each.
```

- [ ] **Step 2: FOLLOWUPS — close what this phase closed, open what it found**

- Item 5 (`moveTask` positional args): prefix with `~~…~~ — RESOLVED:` and append `TasksApi.move({ id, boardId, boardColumnId }) takes an options object.`
- Item 9 (`server.test.ts` only asserts no throw): prefix with `~~…~~ — RESOLVED:` and append `tests/server.test.ts now lists tools over an in-memory transport and compares the exact default set.`
- Items 15 and 16: append `**Spec update 2026-10-02:** the API now documents POST/DELETE /tm/tasks/{taskId}/assignees (15) and GET/POST/DELETE /tm/tasks/{taskId}/comments (16). Re-verify live in Phase 2; the earlier conclusions may be stale.`
- Append:

```markdown
19. **The API has a machine-readable spec and the repo now carries a snapshot** — `spec/weeek-openapi.json`, extracted by `scripts/refresh-spec.mjs` (method in #17). `tests/contract.test.ts` compares it with `src/operations.ts` in both directions; 142 of 157 operations are listed as `notYetImplemented`, grouped by the phase that delivers them (design: `docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md`). Refresh the snapshot whenever WEEEK announces API changes; a new endpoint fails the contract test until it is implemented or deferred.
```

- [ ] **Step 3: Run the full gate once more**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 4: Commit the docs (after go-ahead)**

```bash
git add README.md docs/FOLLOWUPS.md
git commit -m "docs: document toolsets and the API spec snapshot"
```

- [ ] **Step 5: Bump the version and commit (after go-ahead)**

```bash
npm version 0.5.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release 0.5.0"
git push -u origin feat/phase-1-foundation
gh pr create --base main --title "feat: toolsets, operation registry and spec contract (phase 1)" --body-file - <<'EOF'
Phase 1 of the full-API-coverage design (docs/superpowers/specs/2026-10-02-weeek-full-api-coverage-design.md).

- `WEEEK_TOOLSETS` (default `tasks` = today's surface; `all`) — no change for existing installs
- `WeeekClient` split into resource clients behind a facade; `HttpClient` executes registry operations only
- `spec/weeek-openapi.json` + `npm run refresh-spec`; `tests/contract.test.ts` proves registry ⊆ spec and tracks the 142 deferred operations by phase
- Generic name resolver driven by a kinds table
- Tool-quality test pins naming, destructive guards, description bounds

`tools/list` for the default toolset is byte-identical to 0.4.5 (verified in Task 8, step 7).
EOF
```

- [ ] **Step 6: After the PR is merged — tag, which publishes (after go-ahead)**

```bash
git checkout main && git pull
git tag v0.5.0 && git push origin v0.5.0
```

CI (`release.yml`) verifies the tag equals `package.json`'s version, runs the tests, publishes to npm and the MCP registry, and attaches the `.mcpb` to a GitHub Release. Watch it at https://github.com/IlyaIvanchikov/weeek-mcp/actions. If "Verify tag matches package.json version" fails, the bump commit is missing from `main`.

- [ ] **Step 7: Live smoke (user-run, token stays in the server)**

With the published 0.5.0 (or `node dist/index.js`) configured as the `weeek` MCP server:

1. `weeek_version` → `0.5.0`.
2. `weeek_create_task { title: "phase-1 smoke", project: "<an existing project name>" }` → task created; note its id.
3. `weeek_get_task { id }` → the task, `attachments: []`.
4. `weeek_move_task { id, board_id: <board>, column: "<a column name>" }` → moved.
5. `weeek_delete_task { id, confirm: true }` → `{ success: true }`.
6. Restart with `WEEEK_TOOLSETS=bogus` → the server exits with `invalid config: WEEEK_TOOLSETS: unknown toolset "bogus"; valid values: tasks, all`.

Record anything unexpected in `docs/FOLLOWUPS.md`.

---

## Self-review (done while writing; kept so a reader can audit it)

- **Spec coverage, Phase 1 row of §6:** vendored spec + refresh (T1) · registry (T2) · contract test with the full deferred list (T3) · `HttpClient` (T4) · resource-client layout (T5, T6) · generic resolver (T7) · toolsets + `WEEEK_TOOLSETS` (T8) · tool-quality (T9, from §5.2) · README/FOLLOWUPS/release (T10). §4.1 cache invalidation has no Phase 1 writer; `ToolContext.cache` is wired for Phase 2.
- **Type consistency:** `ToolContext` is defined once in `toolsets.ts` and imported as a type by `tools/core.ts`, `tools/tasks.ts`; `AttachmentReadPolicy` lives in `tools/tasks.ts` and is imported by `toolsets.ts`; `Config.toolsets` is `readonly ToolsetName[]` everywhere; `listTools` returns the SDK's `Tool[]`; `IdOf<"member">` is `string`, all other kinds `number`; `TasksApi.move/setCompleted/uploadAttachment` take options objects and every call site in T6 passes them.
- **Review Focus → tests:** (1) T4 `fillPath` encode + missing param; (2) T8 `parseToolsets` normalisation; (3) T8 `all,tasks` registers once; (4) T3 placeholder normalisation; (5) T3 "does not list a deferred operation that is already implemented".
- **Placeholders:** none — every code step contains the code; the two "move verbatim" steps (T6, T8) name the exact source lines and the exact edits.
