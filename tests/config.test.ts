import { describe, it, expect } from "vitest";
import { loadConfig, parseToolsets } from "../src/config.js";
import { toolsetNames } from "../src/toolsets/constants.js";

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

describe("WEEEK_TOOLSETS", () => {
  it("defaults to tasks when unset or empty", () => {
    expect(loadConfig({}).toolsets).toEqual(["tasks"]);
    expect(loadConfig({ WEEEK_TOOLSETS: "" }).toolsets).toEqual(["tasks"]);
    expect(loadConfig({ WEEEK_TOOLSETS: " , " }).toolsets).toEqual(["tasks"]);
  });
  it("normalises whitespace, case, empty segments and duplicates", () => {
    expect(parseToolsets(" tasks , ALL,,tasks")).toEqual(["tasks", "all"]);
  });
  it("rejects an unknown toolset and names the valid ones", () => {
    expect(() => loadConfig({ WEEEK_TOOLSETS: "tasks,crm" })).toThrow(new RegExp(`WEEEK_TOOLSETS.*"crm".*${toolsetNames.join(", ")}`));
  });
  it("keeps the parsed names typed without a cast", () => {
    const names = parseToolsets("tasks");
    // A name the guard did not admit cannot reach here; the array is a ToolsetName[] by construction.
    expect(names.every((name) => toolsetNames.includes(name))).toBe(true);
  });
});
