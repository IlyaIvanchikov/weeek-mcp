import { describe, it, expect } from "vitest";
import { apiFlag, attachmentForm, orNullWhenMissing, pickAttachments } from "../../src/api/requests.js";
import { WeeekApiError } from "../../src/errors.js";

describe("apiFlag", () => {
  it("turns a boolean into the 0/1 the API wants", () => {
    expect(apiFlag(true)).toBe(1);
    expect(apiFlag(false)).toBe(0);
  });
});

describe("orNullWhenMissing", () => {
  it("turns a 404 into null and lets every other error through", async () => {
    expect(await orNullWhenMissing(Promise.reject(new WeeekApiError("no", 404, "http_404")))).toBeNull();
    await expect(orNullWhenMissing(Promise.reject(new WeeekApiError("no", 500, "http_500")))).rejects.toMatchObject({ status: 500 });
    expect(await orNullWhenMissing(Promise.resolve(1))).toBe(1);
  });
});

describe("attachment helpers", () => {
  it("attachmentForm puts the file under files[] with its name", () => {
    const form = attachmentForm({ filename: "f.md", bytes: new Uint8Array([1, 2]) });
    expect((form.get("files[]") as File).name).toBe("f.md");
  });
  it("pickAttachments accepts one attachment or a list", () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "f.md", url: "https://x", size: 2, createdAt: "2026-08-01T10:00:00Z" };
    expect(pickAttachments({ data: att })).toEqual([att]);
    expect(pickAttachments({ data: [att] })).toEqual([att]);
    expect(pickAttachments({})).toEqual([]);
  });
});
