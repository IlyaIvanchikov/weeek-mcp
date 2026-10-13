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
