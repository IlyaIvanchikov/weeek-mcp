import { registerCoreTools } from "../tools/core.js";
import { registerTaskTools } from "../tools/tasks.js";
import { registerCommentTools } from "../tools/comments.js";
import { registerTaskLinkTools } from "../tools/task-links.js";
import { registerTimeTools } from "../tools/time.js";
import { registerProjectTools } from "../tools/projects.js";
import { registerWorkspaceTools } from "../tools/workspace.js";
import { registerCustomFieldTools } from "../tools/custom-fields.js";
import { registerFunnelTools } from "../tools/funnels.js";
import { registerDealTools } from "../tools/deals.js";
import { registerOrganizationTools } from "../tools/organizations.js";
import { registerContactTools } from "../tools/contacts.js";
import { registerCrmLinkTools } from "../tools/crm-links.js";
import type { ToolContext, ToolsetName } from "./types.js";

type RealToolset = Exclude<ToolsetName, "all">;

const registrars: Record<RealToolset, (ctx: ToolContext) => void> = {
  tasks: (ctx) => {
    registerTaskTools(ctx);
    registerCommentTools(ctx);
    registerTaskLinkTools(ctx);
  },
  time: registerTimeTools,
  projects: (ctx) => {
    registerProjectTools(ctx);
    registerWorkspaceTools(ctx);
  },
  "custom-fields": registerCustomFieldTools,
  crm: (ctx) => {
    registerFunnelTools(ctx);
    registerDealTools(ctx);
    registerOrganizationTools(ctx);
    registerContactTools(ctx);
    registerCrmLinkTools(ctx);
  },
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
