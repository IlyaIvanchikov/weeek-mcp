#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.token) {
    // Boot anyway so clients/registries can list the tools; calls fail until it is set.
    console.error("weeek-mcp-smart: WEEEK_API_TOKEN not set — tools are listed, but any call fails until you provide it.");
  }
  const server = buildServer(config);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  // Never print the token; only the error message.
  console.error(`weeek-mcp-smart failed to start: ${(err as Error).message}`);
  process.exit(1);
});
