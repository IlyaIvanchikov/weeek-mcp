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
