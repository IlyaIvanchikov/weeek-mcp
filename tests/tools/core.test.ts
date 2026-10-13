import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoreTools } from "../../src/tools/core.js";

describe("core tools", () => {
  it("weeek_version returns the package name and version", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const server = new McpServer({ name: "t", version: "0" });
    const handlers = new Map<string, Function>();
    vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
      handlers.set(name, (raw: unknown) => cb(z.object(config?.inputSchema ?? {}).parse(raw)));
      return undefined as any;
    }) as any);
    registerCoreTools({ server } as any);
    const res = await handlers.get("weeek_version")!({});
    expect(JSON.parse(res.content[0].text)).toEqual({ name: pkg.name, version: pkg.version });
  });
});
