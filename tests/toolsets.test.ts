import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expandToolsets, registerToolsets, defaultToolsets, toolsetNames } from "../src/toolsets.js";
import { WeeekClient } from "../src/client.js";
import { Resolver } from "../src/resolver.js";
import { NameCache } from "../src/cache.js";
import { listTools } from "./helpers/list-tools.js";
import { defaultToolNames } from "./helpers/default-tool-names.js";

const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024, toolsets: defaultToolsets };

function context() {
  const client = new WeeekClient(cfg);
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
    expect(expandToolsets(["all"])).toEqual(["tasks"]);
    expect(expandToolsets(["all", "tasks"])).toEqual(["tasks"]);
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
    expect(names).toEqual(defaultToolNames);
  });

  it("always registers weeek_version, even for an empty selection", async () => {
    const ctx = context();
    registerToolsets(ctx, []);
    expect((await listTools(ctx.server)).map((t) => t.name)).toEqual(["weeek_version"]);
  });
});
