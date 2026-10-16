import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { Resolver } from "../resolver.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, hexColor, nameOrId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

interface BoardRef { board: string | number; project?: string | number; }
interface ColumnRef { column: string | number; board?: string | number; project?: string | number; }
interface ColumnScope { boardId?: number; projectId?: number; }

/** Ids for a board given by id, or by name inside its project. */
async function resolveBoard(resolver: Resolver, { board, project }: BoardRef): Promise<{ boardId: number; projectId?: number }> {
  const projectId = project === undefined ? undefined : await resolver.resolve({ kind: "project", value: project });
  const boardId = await resolver.resolve({ kind: "board", value: board, scope: { projectId } });
  return { boardId, projectId };
}

/** Ids for a column given by id, or by name inside its board or project. */
async function resolveColumn(resolver: Resolver, { column, board, project }: ColumnRef): Promise<{ columnId: number } & ColumnScope> {
  const projectId = project === undefined ? undefined : await resolver.resolve({ kind: "project", value: project });
  const boardId = board === undefined ? undefined : await resolver.resolve({ kind: "board", value: board, scope: { projectId } });
  const columnId = await resolver.resolve({ kind: "column", value: column, scope: { boardId, projectId } });
  return { columnId, boardId, projectId };
}

export function registerProjectTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_get_project", {
    description: "Get one WEEEK project by name or id: description, privacy, status, portfolio and team member ids.",
    inputSchema: { project: nameOrId },
  }, async (args) => client.projects.get(await resolver.resolve({ kind: "project", value: args.project })));

  registerJsonTool(server, "weeek_create_project", {
    description: "Create a WEEEK project. Optional description, `private` (default false) and a `portfolio` (name or id) to file it under.",
    inputSchema: { name: z.string().min(1), description: z.string().optional(), private: z.boolean().default(false), portfolio: nameOrId.optional() },
  }, async (args) => {
    const portfolioId = args.portfolio === undefined ? undefined : await resolver.resolve({ kind: "portfolio", value: args.portfolio });
    const project = await client.projects.create({ name: args.name, isPrivate: args.private, description: args.description, portfolioId });
    resolver.forget({ kind: "project" });
    return project;
  });

  registerJsonTool(server, "weeek_update_project", {
    description: "Rename a WEEEK project (by name or id) or change its privacy or colour (# and six hex digits). Fields you omit keep their current value. An archived project is not in the project list, so give it by id.",
    inputSchema: { project: nameOrId, name: z.string().min(1).optional(), private: z.boolean().optional(), color: hexColor.optional() },
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    // PUT replaces name and isPrivate, so the current values are read first.
    const currentProject = await client.projects.get(projectId);
    const project = await client.projects.update({
      projectId,
      update: { name: args.name ?? currentProject.name, isPrivate: args.private ?? currentProject.isPrivate, color: args.color ?? currentProject.color ?? undefined },
    });
    resolver.forget({ kind: "project" });
    return project;
  });

  registerJsonTool(server, "weeek_archive_project", {
    description: "Archive a WEEEK project (archived:true, the default) or restore an archived one (archived:false). Requires confirm:true. An archived project is not in the project list, so give it by id, not by name. Prefer this over weeek_delete_project when the tasks must survive.",
    inputSchema: { project: nameOrId, archived: z.boolean().default(true), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const project = await client.projects.setArchived({ projectId, archived: args.archived });
    resolver.forget({ kind: "project" });
    return project;
  });

  registerJsonTool(server, "weeek_delete_project", {
    description: "Permanently delete a WEEEK project and everything in it. Irreversible; requires confirm:true. An archived project is not in the project list, so give it by id, not by name. To hide a project without losing it use weeek_archive_project.",
    inputSchema: { project: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const removal = await client.projects.remove(projectId);
    resolver.forget({ kind: "project" });
    return removal;
  });

  registerJsonTool(server, "weeek_create_board", {
    description: "Create a board in a WEEEK project (by name or id).",
    inputSchema: { project: nameOrId, name: z.string().min(1) },
  }, async (args) => {
    const projectId = await resolver.resolve({ kind: "project", value: args.project });
    const board = await client.boards.create({ name: args.name, projectId });
    resolver.forget({ kind: "board", scope: { projectId } });
    return board;
  });

  registerJsonTool(server, "weeek_update_board", {
    description: "Rename a WEEEK board. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), name: z.string().min(1) },
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const renameResponse = await client.boards.update({ boardId, name: args.name });
    resolver.forget({ kind: "board", scope: { projectId } });
    return renameResponse;
  });

  registerJsonTool(server, "weeek_delete_board", {
    description: "Permanently delete a WEEEK board and its columns. Irreversible; requires confirm:true. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const removal = await client.boards.remove(boardId);
    resolver.forget({ kind: "board", scope: { projectId } });
    resolver.forget({ kind: "column" });
    return removal;
  });

  registerJsonTool(server, "weeek_move_board", {
    description: "Reorder a WEEEK board: place it right after the board `after` (name or id in the same project), or first with after:null. Pass boards by id, or by name together with `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), after: nameOrId.nullable() },
  }, async (args) => {
    const { boardId, projectId } = await resolveBoard(resolver, args);
    const upperBoardId = args.after === null ? null : await resolver.resolve({ kind: "board", value: args.after, scope: { projectId } });
    return client.boards.move({ boardId, upperBoardId });
  });

  registerJsonTool(server, "weeek_create_column", {
    description: "Create a column on a WEEEK board. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional(), name: z.string().min(1) },
  }, async (args) => {
    const { boardId } = await resolveBoard(resolver, args);
    const column = await client.columns.create({ name: args.name, boardId });
    resolver.forget({ kind: "column" });
    return column;
  });

  registerJsonTool(server, "weeek_update_column", {
    description: "Rename a WEEEK board column. Pass the column by id, or by name together with its `board` (and `project` when the board is a name).",
    inputSchema: { column: nameOrId, board: nameOrId.optional(), project: nameOrId.optional(), name: z.string().min(1) },
  }, async (args) => {
    const { columnId } = await resolveColumn(resolver, args);
    const renameResponse = await client.columns.update({ columnId, name: args.name });
    resolver.forget({ kind: "column" });
    return renameResponse;
  });

  registerJsonTool(server, "weeek_delete_column", {
    description: "Permanently delete a WEEEK board column. Irreversible; requires confirm:true. Pass the column by id, or by name together with its `board` (and `project` when the board is a name).",
    inputSchema: { column: nameOrId, board: nameOrId.optional(), project: nameOrId.optional(), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { columnId } = await resolveColumn(resolver, args);
    const removal = await client.columns.remove(columnId);
    resolver.forget({ kind: "column" });
    return removal;
  });

  registerJsonTool(server, "weeek_move_column", {
    description: "Reorder a WEEEK board column: place it right after the column `after` (name or id on the same board), or first with after:null. Pass columns by id, or by name together with `board` (and `project` when the board is a name).",
    inputSchema: { column: nameOrId, board: nameOrId.optional(), project: nameOrId.optional(), after: nameOrId.nullable() },
  }, async (args) => {
    const { columnId, boardId, projectId } = await resolveColumn(resolver, args);
    const upperColumnId = args.after === null ? null : await resolver.resolve({ kind: "column", value: args.after, scope: { boardId, projectId } });
    return client.columns.move({ columnId, upperColumnId });
  });
}
