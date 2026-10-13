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
