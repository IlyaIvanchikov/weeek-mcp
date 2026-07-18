import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { WeeekClient } from "./client.js";
import { NameCache } from "./cache.js";
import { Resolver } from "./resolver.js";
import { registerReadTools } from "./tools/reads.js";
import { registerWriteTools } from "./tools/writes.js";
import { NAME, VERSION } from "./version.js";

export function buildServer(config: Config): McpServer {
  const client = new WeeekClient(config);
  const cache = new NameCache(60_000);
  const resolver = new Resolver(client, cache);
  const server = new McpServer({ name: NAME, version: VERSION });
  registerReadTools(server, client);
  registerWriteTools(server, client, resolver);
  return server;
}
