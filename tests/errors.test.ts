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
