import { describe, it, expect } from "vitest";
import { apiFlag, orNullWhenMissing } from "../../src/api/requests.js";
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
