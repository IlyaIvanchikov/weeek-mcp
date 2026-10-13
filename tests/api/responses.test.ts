import { describe, it, expect } from "vitest";
import { pickArray, toMember } from "../../src/api/responses.js";

describe("pickArray", () => {
  it("returns the array under the expected key", () => {
    expect(pickArray({ success: true, tags: [1] }, "tags")).toEqual([1]);
  });
  it("falls back to the first array present when the key is missing", () => {
    expect(pickArray({ success: true, items: [2] }, "tags")).toEqual([2]);
  });
  it("returns [] when nothing is an array", () => {
    expect(pickArray({ success: true }, "tags")).toEqual([]);
  });
});

describe("toMember", () => {
  it("joins first and last name", () => {
    expect(toMember({ id: "u1", firstName: "Ilya", lastName: "I" })).toEqual({ id: "u1", name: "Ilya I" });
  });
  it("falls back to name, then email, then the id", () => {
    expect(toMember({ id: "u2", name: "Bot" })).toEqual({ id: "u2", name: "Bot" });
    expect(toMember({ id: "u3", email: "x@y.z" })).toEqual({ id: "u3", name: "x@y.z" });
    expect(toMember({ id: "u4" })).toEqual({ id: "u4", name: "u4" });
  });
});
