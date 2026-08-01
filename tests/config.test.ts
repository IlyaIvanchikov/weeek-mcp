import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("reads the token from env and applies defaults", () => {
    const c = loadConfig({ WEEEK_API_TOKEN: "x".repeat(24) });
    expect(c.token).toBe("x".repeat(24));
    expect(c.baseUrl).toBe("https://api.weeek.net/public/v1");
    expect(c.timeoutMs).toBe(30000);
  });
  it("allows a missing token so tools can be listed without credentials", () => {
    const c = loadConfig({});
    expect(c.token).toBeUndefined();
    expect(c.baseUrl).toBe("https://api.weeek.net/public/v1");
  });
  it("throws when the token is too short", () => {
    expect(() => loadConfig({ WEEEK_API_TOKEN: "short" })).toThrow(/WEEEK_API_TOKEN/);
  });
});
