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
