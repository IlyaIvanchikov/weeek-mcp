import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient, CreateTaskBody } from "../client.js";
import type { Resolver } from "../resolver.js";
import { resolveSafeAttachPath, type AttachPolicy } from "../attach.js";
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

export function registerWriteTools(
  server: McpServer,
  client: WeeekClient,
  resolver: Resolver,
  attachPolicy: AttachPolicy,
): void {
  server.registerTool(
    "weeek_create_task",
    {
      description: "Create a WEEEK task. Accepts project/column/assignee by NAME or id, and a natural-language `due` date. One call — no need to look up ids first. Omit `assignee` to self-assign (WEEEK assigns the token owner); pass a member name/id to assign someone else. Reassigning an existing task is not supported by the WEEEK public API — set the assignee at creation.",
      inputSchema: createShape,
    },
    async (args) => {
      try {
        const body = await buildCreateBody(resolver, args as CreateInput);
        return jsonReply(await client.createTask(body));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_create_tasks",
    {
      description: "Create many WEEEK tasks in one call. Returns a per-item report; one bad name does not abort the batch.",
      inputSchema: { tasks: z.array(z.object(createShape)).min(1).max(50) },
    },
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

  server.registerTool(
    "weeek_update_task",
    {
      description: "Update an existing WEEEK task's title or due date. NOTE: description is NOT updatable — WEEEK's API silently ignores it on update; set the description at create time (weeek_create_task) or edit it in the UI.",
      inputSchema: { id: z.number().int(), title: z.string().optional(), due: z.string().optional() },
    },
    async (args) => {
      try {
        const patch: Record<string, unknown> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.due !== undefined) patch.dayFrom = parseDueDate(args.due);
        return jsonReply(await client.updateTask(args.id, patch));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_delete_task",
    {
      description:
        "Permanently delete a WEEEK task by id. Irreversible — the task is removed, not just completed. Requires confirm:true; to merely close a task use weeek_complete_task instead.",
      inputSchema: {
        id: z.number().int(),
        confirm: z.literal(true).describe("Must be true to confirm this irreversible deletion."),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (args) => {
      try { return jsonReply(await client.deleteTask(args.id)); }
      catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_attach_file",
    {
      description:
        "Attach a local file to a WEEEK task. For safety only files inside the allowed directory (the server's working directory by default, or WEEEK_ATTACH_DIR if set) — and its subfolders — may be attached; paths outside it are refused.",
      inputSchema: { task_id: z.number().int(), path: z.string() },
      annotations: { openWorldHint: true },
    },
    async (args) => {
      try {
        const safePath = await resolveSafeAttachPath(args.path, attachPolicy);
        const data = await readFile(safePath);
        return jsonReply(await client.attachFile(args.task_id, basename(safePath), data));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_move_task",
    { description: "Move a WEEEK task to a column (by name or id, scoped to the given board) on that board.", inputSchema: { id: z.number().int(), board_id: z.number().int(), column: nameOrId } },
    async (args) => {
      try {
        const columnId = await resolver.resolveColumnInBoard(args.board_id, args.column);
        return jsonReply(await client.moveTask(args.id, args.board_id, columnId));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_complete_task",
    { description: "Mark a WEEEK task complete, or reopen it (completed:false).", inputSchema: { id: z.number().int(), completed: z.boolean() } },
    async (args) => {
      try { return jsonReply(await client.setCompleted(args.id, args.completed)); }
      catch (err) { return errorReply(err); }
    },
  );
}
