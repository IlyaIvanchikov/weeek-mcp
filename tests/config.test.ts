import { describe, it, expect } from "vitest";
import { isToolsetName, loadConfig, parseToolsets } from "../src/config.js";
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
    expect(() => loadConfig({ WEEEK_TOOLSETS: "tasks,analytics" })).toThrow(new RegExp(`WEEEK_TOOLSETS.*"analytics".*${toolsetNames.join(", ")}`));
  });
  it("validates each name once and keeps the parsed names typed", () => {
    expect(parseToolsets("Tasks, tasks ,TIME")).toEqual(["tasks", "time"]);
    expect(toolsetNames.every(isToolsetName)).toBe(true);
    expect(isToolsetName("analytics")).toBe(false);
    expect(isToolsetName("Tasks")).toBe(false);
  });
});
