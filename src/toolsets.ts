import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient } from "./client.js";
import type { Resolver } from "./resolver.js";
import type { NameCache } from "./cache.js";
import type { AttachPolicy } from "./attach.js";
import { registerCoreTools } from "./tools/core.js";
import { registerTaskTools, type AttachmentReadPolicy } from "./tools/tasks.js";

// Which groups of tools a running server exposes. The default stays small on purpose:
// every tool's schema travels to the model on every request, and registries score the
// count. Pick more with WEEEK_TOOLSETS (comma-separated) or "all". The set grows by one
// per release phase: projects, custom-fields, crm.
export const toolsetNames = ["tasks", "all"] as const;
export type ToolsetName = (typeof toolsetNames)[number];
export const defaultToolsets: readonly ToolsetName[] = ["tasks"];

type RealToolset = Exclude<ToolsetName, "all">;

export interface ToolContext {
  server: McpServer;
  client: WeeekClient;
  resolver: Resolver;
  /** Write tools invalidate the name lists they change; the cache never learns which tool does what. */
  cache: NameCache;
  attachPolicy: AttachPolicy;
  readPolicy: AttachmentReadPolicy;
}

const registrars: Record<RealToolset, (ctx: ToolContext) => void> = {
  tasks: registerTaskTools,
};

export function expandToolsets(selected: readonly ToolsetName[]): RealToolset[] {
  const names = selected.includes("all")
    ? (Object.keys(registrars) as RealToolset[])
    : selected.filter((name): name is RealToolset => name !== "all");
  return [...new Set(names)];
}

export function registerToolsets(ctx: ToolContext, selected: readonly ToolsetName[]): void {
  registerCoreTools(ctx);
  for (const name of expandToolsets(selected)) registrars[name](ctx);
}
