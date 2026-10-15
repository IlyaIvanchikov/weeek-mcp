import { describe, it, expect } from "vitest";
import { WeeekApiError, ResolutionError } from "../src/errors.js";

describe("errors", () => {
  it("WeeekApiError carries status and code", () => {
    const e = new WeeekApiError("boom", 404, "not_found");
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
    expect(e.name).toBe("WeeekApiError");
  });
  it("ResolutionError carries kind, query and candidates", () => {
    const e = new ResolutionError("project", "Marketing", [{ id: 1, name: "Marketing A" }]);
    expect(e.kind).toBe("project");
    expect(e.candidates).toHaveLength(1);
    expect(e.name).toBe("ResolutionError");
  });
});

describe("ResolutionError hint", () => {
  it("appends a hint after the candidates when one is given", () => {
    const err = new ResolutionError("custom field", "Lane", [], "a board's own fields can be set with weeek_update_task once the task exists");
    expect(err.message).toBe('could not resolve custom field "Lane"; candidates: none — a board\'s own fields can be set with weeek_update_task once the task exists');
    expect(err.candidates).toEqual([]);
  });
});
