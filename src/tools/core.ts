import type { ToolContext } from "../toolsets/types.js";
import { NAME, VERSION } from "../version.js";
import { jsonReply } from "./reply.js";

/** Tools that belong to no toolset and are always present. */
export function registerCoreTools({ server }: ToolContext): void {
  server.registerTool(
    "weeek_version",
    { description: "Return this MCP server's name and version, so callers can check which build is running.", inputSchema: {} },
    async () => jsonReply({ name: NAME, version: VERSION }),
  );
}
