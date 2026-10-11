import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { WeeekClient } from "./client.js";
import { NameCache } from "./cache.js";
import { Resolver } from "./resolver.js";
import { registerToolsets } from "./toolsets.js";
import { NAME, VERSION } from "./version.js";

export function buildServer(config: Config): McpServer {
  const client = new WeeekClient(config);
  const cache = new NameCache(60_000);
  const resolver = new Resolver(client, cache);
  const server = new McpServer({ name: NAME, version: VERSION });
  registerToolsets(
    {
      server, client, resolver, cache,
      // Default the attach jail to the working directory so the tool works with no
      // configuration; WEEEK_ATTACH_DIR overrides it to point/lock it elsewhere.
      attachPolicy: { attachDir: config.attachDir ?? process.cwd(), maxBytes: config.attachMaxBytes },
      readPolicy: { maxBytes: config.attachMaxBytes },
    },
    config.toolsets,
  );
  return server;
}
