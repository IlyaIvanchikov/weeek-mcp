import { describe, it, expect } from "vitest";
import { apiFlag } from "../../src/api/requests.js";

describe("apiFlag", () => {
  it("turns a boolean into the 0/1 the API wants", () => {
    expect(apiFlag(true)).toBe(1);
    expect(apiFlag(false)).toBe(0);
  });
});
