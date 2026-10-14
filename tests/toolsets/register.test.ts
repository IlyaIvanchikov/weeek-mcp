import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expandToolsets, registerToolsets } from "../../src/toolsets/register.js";
import { defaultToolsets, toolsetNames } from "../../src/toolsets/constants.js";
import type { ToolContext } from "../../src/toolsets/types.js";
import { WeeekClient } from "../../src/client.js";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { listTools } from "../helpers/list-tools.js";
import { allToolNames, defaultToolNames, timeToolNames } from "../helpers/tool-names.js";
import { httpConfig } from "../helpers/http.js";

function context(): ToolContext {
  const client = new WeeekClient(httpConfig);
  const cache = new NameCache(60_000);
  return {
    server: new McpServer({ name: "t", version: "0" }),
    client, cache, resolver: new Resolver(client, cache),
    attachPolicy: { attachDir: "/tmp", maxBytes: 1024 },
    readPolicy: { maxBytes: 1024 },
  };
}

describe("toolsets", () => {
  it("defaults to tasks only", () => {
    expect(defaultToolsets).toEqual(["tasks"]);
    expect(toolsetNames).toContain("all");
  });

  it("expandToolsets turns all into every real toolset and de-duplicates", () => {
    const real = toolsetNames.filter((name) => name !== "all");
    expect(expandToolsets(["all"])).toEqual(real);
    expect(expandToolsets(["all", "tasks"])).toEqual(real);
    expect(expandToolsets(["tasks", "tasks"])).toEqual(["tasks"]);
  });

  it("registers core + the tasks toolset for the default", async () => {
    const ctx = context();
    registerToolsets(ctx, defaultToolsets);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(defaultToolNames);
  });

  it("registers each tool exactly once for all,tasks", async () => {
    const ctx = context();
    expect(() => registerToolsets(ctx, ["all", "tasks"])).not.toThrow();
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(allToolNames);
  });

  it("always registers weeek_version, even for an empty selection", async () => {
    const ctx = context();
    registerToolsets(ctx, []);
    expect((await listTools(ctx.server)).map((t) => t.name)).toEqual(["weeek_version"]);
  });

  it("registers every toolset's tools exactly once for all", async () => {
    const ctx = context();
    registerToolsets(ctx, ["all"]);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(allToolNames);
  });

  it("registers only core + time for the time toolset", async () => {
    const ctx = context();
    registerToolsets(ctx, ["time"]);
    const names = (await listTools(ctx.server)).map((t) => t.name).sort();
    expect(names).toEqual(["weeek_version", ...timeToolNames].sort());
  });
});
