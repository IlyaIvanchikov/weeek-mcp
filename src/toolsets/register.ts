import { registerCoreTools } from "../tools/core.js";
import { registerTaskTools } from "../tools/tasks.js";
import type { ToolContext, ToolsetName } from "./types.js";

type RealToolset = Exclude<ToolsetName, "all">;

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
