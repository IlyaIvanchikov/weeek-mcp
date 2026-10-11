import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient } from "../client.js";
import type { Resolver } from "../resolver.js";
import type { NameCache } from "../cache.js";
import type { AttachPolicy, AttachmentReadPolicy } from "../attach.js";
import type { toolsetNames } from "./constants.js";

export type ToolsetName = (typeof toolsetNames)[number];

export interface ToolContext {
  server: McpServer;
  client: WeeekClient;
  resolver: Resolver;
  /** Write tools invalidate the name lists they change; the cache never learns which tool does what. */
  cache: NameCache;
  attachPolicy: AttachPolicy;
  readPolicy: AttachmentReadPolicy;
}
