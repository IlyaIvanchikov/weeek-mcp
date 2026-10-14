// The oracle for "all endpoints": the registry in src/operations.ts must match the vendored
// spec in both directions. Placeholders are normalised because the spec names the same
// parameter {id}, {task_id} or {taskId} depending on the endpoint, and ours are camelCase.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { listOperations } from "../src/operations.js";

const spec = JSON.parse(readFileSync(new URL("../spec/weeek-openapi.json", import.meta.url), "utf8"));
// OpenAPI's full method set, not only the ones the server calls today, so a HEAD or OPTIONS
// operation appearing in a refreshed spec is counted rather than silently ignored.
const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

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
  // ── Phase 4 · CRM ───────────────────────────────────────────────────────
  "POST /crm/funnels", "GET /crm/funnels/{}", "PUT /crm/funnels/{}", "DELETE /crm/funnels/{}",
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
