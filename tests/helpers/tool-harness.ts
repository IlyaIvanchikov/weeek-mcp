import { vi } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import type { ToolContext } from "../../src/toolsets/types.js";

type ToolHandler = (rawArgs: unknown) => Promise<any>;

/**
 * Registers one tool group against a stub client and hands back a `call(name, args)` that
 * replays the real server's step of parsing raw args against the tool's zod shape, so
 * defaults, enums and `confirm` gates are exercised the way a client would hit them.
 */
export function toolHarness(register: (ctx: ToolContext) => void, clientStub: Record<string, unknown>) {
  const client = clientStub as any;
  const cache = new NameCache(100_000, () => 0);
  const resolver = new Resolver(client, cache);
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, ToolHandler>();
  vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
    const schema = z.object(config?.inputSchema ?? {});
    handlers.set(name, (rawArgs: unknown) => cb(schema.parse(rawArgs)));
    return undefined as any;
  }) as any);
  register({ server, client, resolver, cache, attachPolicy: { attachDir: "/allowed", maxBytes: 1000 }, readPolicy: { maxBytes: 1024 } });
  const call = (name: string, args: unknown) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no tool named ${name} was registered`);
    return handler(args);
  };
  return { call, cache, resolver, handlers };
}

/** The JSON a tool replied with. */
export const reply = (res: any) => JSON.parse(res.content[0].text);

/** Members every name-taking test can resolve against. */
export const stubMembers = [{ id: "a2318d51-46cd-42a9-bab4-554c80824574", name: "Ilya" }, { id: "b2318d51-46cd-42a9-bab4-554c80824574", name: "Ann" }];
