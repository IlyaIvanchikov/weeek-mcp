import { describe, it, expect } from "vitest";
import { asRecord, fullName, isOneOf, pickArray, pickEntity, stringList, toMember, toProfile, toWorkspace } from "../../src/api/responses.js";

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

describe("toProfile", () => {
  it("keeps the member name rule and adds the profile fields, nulling the absent ones", () => {
    expect(toProfile({ id: "u1", email: "i@x.y", firstName: "Ilya" })).toEqual({ id: "u1", name: "Ilya", email: "i@x.y", language: null, timeZone: null });
  });
});

describe("asRecord", () => {
  it("returns the object itself, and {} for anything that is not one", () => {
    const record = { id: 1 };
    expect(asRecord(record)).toBe(record);
    expect(asRecord(null)).toEqual({});
    expect(asRecord("x")).toEqual({});
    expect(asRecord(undefined)).toEqual({});
  });
});

describe("isOneOf", () => {
  it("narrows a value to a member of a closed list, for strings and numbers", () => {
    expect(isOneOf(["a", "b"] as const, "a")).toBe(true);
    expect(isOneOf(["a", "b"] as const, "c")).toBe(false);
    expect(isOneOf([1, 2] as const, 2)).toBe(true);
    expect(isOneOf([1, 2] as const, "2")).toBe(false);
  });
});

describe("toWorkspace", () => {
  it("normalises the workspace and nulls a missing description", () => {
    expect(toWorkspace({ id: "3", title: "Acme", isPersonal: 1 })).toEqual({ id: 3, title: "Acme", description: null, isPersonal: true });
  });
});

describe("fullName and stringList", () => {
  it("joins first, middle and last names, skipping blanks", () => {
    expect(fullName({ firstName: "Ann", middleName: null, lastName: "Lee" })).toBe("Ann Lee");
    expect(fullName({ firstName: "Ann", middleName: "B", lastName: "Lee" })).toBe("Ann B Lee");
    expect(fullName({})).toBe("");
  });
  it("coerces a list to strings and anything else to []", () => {
    expect(stringList([1, "a"])).toEqual(["1", "a"]);
    expect(stringList("x")).toEqual([]);
  });
  it("toMember names a member by first and last name, ignoring a middle name", () => {
    expect(toMember({ id: "u1", firstName: "Ann", middleName: "B", lastName: "Lee" })).toEqual({ id: "u1", name: "Ann Lee" });
  });
});

describe("pickEntity", () => {
  it("reads the spec's key, and falls back to `data`, which the board custom-field route answers instead", () => {
    const field = { id: "f1", name: "Lane", type: "text" };
    expect(pickEntity({ success: true, customField: field }, "customField")).toBe(field);
    expect(pickEntity({ success: true, data: field }, "customField")).toBe(field);
    expect(pickEntity({ success: true }, "customField")).toBeUndefined();
  });
});
