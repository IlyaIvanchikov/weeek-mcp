import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient, CreateTaskBody } from "../client.js";
import type { Resolver } from "../resolver.js";
import { parseDueDate } from "../dates.js";
import { jsonReply, errorReply } from "./reply.js";

const nameOrId = z.union([z.string(), z.number()]);

interface CreateInput {
  title: string; project: string | number;
  column?: string | number; assignee?: string | number;
  due?: string; description?: string;
}

export async function buildCreateBody(resolver: Resolver, input: CreateInput): Promise<CreateTaskBody> {
  const projectId = await resolver.resolveProject(input.project);
  const body: CreateTaskBody = { title: input.title, projectId };
  if (input.column !== undefined) body.boardColumnId = await resolver.resolveColumn(projectId, input.column);
  if (input.assignee !== undefined) body.userId = await resolver.resolveAssignee(input.assignee);
  if (input.due !== undefined) body.dayFrom = parseDueDate(input.due);
  if (input.description !== undefined) body.description = input.description;
  return body;
}

const createShape = {
  title: z.string(),
  project: nameOrId,
  column: nameOrId.optional(),
  assignee: nameOrId.optional(),
  due: z.string().optional(),
  description: z.string().optional(),
};

export function registerWriteTools(server: McpServer, client: WeeekClient, resolver: Resolver): void {
  server.tool(
    "weeek_create_task",
    "Create a WEEEK task. Accepts project/column/assignee by NAME or id, and a natural-language `due` date. One call — no need to look up ids first.",
    createShape,
    async (args) => {
      try {
        const body = await buildCreateBody(resolver, args as CreateInput);
        return jsonReply(await client.createTask(body));
      } catch (err) { return errorReply(err); }
    },
  );

  server.tool(
    "weeek_create_tasks",
    "Create many WEEEK tasks in one call. Returns a per-item report; one bad name does not abort the batch.",
    { tasks: z.array(z.object(createShape)).min(1).max(50) },
    async (args) => {
      const report: Array<{ ok: boolean; task?: unknown; error?: string; candidates?: unknown }> = [];
      for (const t of args.tasks) {
        try {
          const body = await buildCreateBody(resolver, t as CreateInput);
          report.push({ ok: true, task: await client.createTask(body) });
        } catch (err) {
          const e = err as { name?: string; message?: string };
          const entry: { ok: false; error: string; candidates?: unknown } = { ok: false, error: e.message ?? String(err) };
          if (e.name === "ResolutionError") entry.candidates = (err as any).candidates;
          report.push(entry);
        }
      }
      return jsonReply(report);
    },
  );

  server.tool(
    "weeek_update_task",
    "Update an existing WEEEK task's title, description, or due date.",
    { id: z.number().int(), title: z.string().optional(), description: z.string().optional(), due: z.string().optional() },
    async (args) => {
      try {
        const patch: Record<string, unknown> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.description !== undefined) patch.description = args.description;
        if (args.due !== undefined) patch.dayFrom = parseDueDate(args.due);
        return jsonReply(await client.updateTask(args.id, patch));
      } catch (err) { return errorReply(err); }
    },
  );

  server.tool(
    "weeek_move_task",
    "Move a WEEEK task to a column (by name or id, scoped to the given board) on that board.",
    { id: z.number().int(), board_id: z.number().int(), column: nameOrId },
    async (args) => {
      try {
        const columnId = await resolver.resolveColumnInBoard(args.board_id, args.column);
        return jsonReply(await client.moveTask(args.id, args.board_id, columnId));
      } catch (err) { return errorReply(err); }
    },
  );

  server.tool(
    "weeek_complete_task",
    "Mark a WEEEK task complete, or reopen it (completed:false).",
    { id: z.number().int(), completed: z.boolean() },
    async (args) => {
      try { return jsonReply(await client.setCompleted(args.id, args.completed)); }
      catch (err) { return errorReply(err); }
    },
  );
}
