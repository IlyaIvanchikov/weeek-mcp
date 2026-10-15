// The oracle for "all endpoints": the registry in src/operations.ts must match the vendored
// spec exactly, in both directions. Placeholders are normalised because the spec names the same
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

describe("API contract", () => {
  it("registers only operations the spec has", () => {
    const unknown = [...registered].filter((k) => !specOperations.has(k));
    expect(unknown, "registered but not in spec/weeek-openapi.json — typo, or the API dropped it").toEqual([]);
  });

  it("covers every spec operation", () => {
    const missing = [...specOperations].filter((k) => !registered.has(k));
    expect(missing, "in the spec, not registered — run `npm run refresh-spec`? then implement").toEqual([]);
  });

  it("treats differently named path parameters as the same operation", () => {
    expect(normalise("get", "/tm/tasks/{id}")).toBe(normalise("GET", "/tm/tasks/{taskId}"));
  });

  it("accounts for every operation: registered = spec", () => {
    expect(registered.size).toBe(specOperations.size);
  });
});
