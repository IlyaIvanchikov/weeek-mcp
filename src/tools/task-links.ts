import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, nameOrIdList, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { resolveMembers } from "./members.js";

/** Tools that attach a task to people and places: assignees, watchers, projects, a parent task. */
export function registerTaskLinkTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_add_assignees", {
    description: "Assign one or more workspace members (by name or id) to a WEEEK task, keeping the existing assignees. Returns the task.",
    inputSchema: { id: taskId, assignees: nameOrIdList },
  }, async (args) => client.tasks.addAssignees({ taskId: args.id, memberIds: await resolveMembers(resolver, args.assignees) }));

  registerJsonTool(server, "weeek_remove_assignees", {
    description: "Unassign one or more members (by name or id) from a WEEEK task. Requires confirm:true. Returns the task.",
    inputSchema: { id: taskId, assignees: nameOrIdList, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeAssignees({ taskId: args.id, memberIds: await resolveMembers(resolver, args.assignees) }));

  registerJsonTool(server, "weeek_add_watchers", {
    description: "Add members (by name or id) as watchers of a WEEEK task, so they get its notifications. Returns the task; watchers are its `watchers` field.",
    inputSchema: { id: taskId, watchers: nameOrIdList },
  }, async (args) => client.tasks.addWatchers({ taskId: args.id, memberIds: await resolveMembers(resolver, args.watchers) }));

  registerJsonTool(server, "weeek_remove_watchers", {
    description: "Stop members (by name or id) watching a WEEEK task. Requires confirm:true. Returns the task.",
    inputSchema: { id: taskId, watchers: nameOrIdList, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeWatchers({ taskId: args.id, memberIds: await resolveMembers(resolver, args.watchers) }));

  registerJsonTool(server, "weeek_add_task_to_project", {
    description: "Show a WEEEK task in another project too (a task can live in several). Project and optional column by name or id. To move between boards of one project use weeek_move_task.",
    inputSchema: { id: taskId, project: nameOrId, column: nameOrId.optional() },
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const boardColumnId = args.column === undefined ? undefined : await resolver.resolve({ kind: "column", value: args.column, scope: { projectId } });
    return client.tasks.addLocation({ taskId: args.id, projectId, boardColumnId });
  });

  registerJsonTool(server, "weeek_remove_task_from_project", {
    description: "Remove a WEEEK task from one of its projects (by name or id); the task keeps its other projects. Requires confirm:true.",
    inputSchema: { id: taskId, project: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeLocation({ taskId: args.id, projectId: await resolver.resolve({ kind: "project", value: args.project }) }));

  registerJsonTool(server, "weeek_set_task_parent", {
    description: "Make a WEEEK task a subtask of `parent` (a task id), or pass parent:null to detach it and make it top-level again.",
    inputSchema: { id: taskId, parent: z.number().int().nullable() },
  }, async (args) => client.tasks.setParent({ taskId: args.id, parentId: args.parent }));
}
