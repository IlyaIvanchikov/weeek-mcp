import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolContext } from "../toolsets/types.js";
import type { NewTask, WeeekTask } from "../client.js";
import type { Resolver } from "../resolver.js";
import { resolveSafeAttachPath } from "../attach.js";
import { parseDueDate } from "../dates.js";
import { jsonReply, imageReply, errorReply } from "./reply.js";

// Upper bound on auto-pagination: even with the required userId + date range, a
// wide range must not loop unbounded or build a response too large for the caller.
// On overflow we throw rather than silently truncate, so the caller narrows the range.
export const MAX_AUTO_PAGES = 20;

// An attachment id goes straight into the request path, and it reaches this tool from
// untrusted task text via the model. Restricting it to id characters keeps the path
// from being steered elsewhere; the API declares file_id as a plain string, so this
// deliberately does not demand a uuid it never promised.
const ATTACHMENT_ID = /^[A-Za-z0-9_-]+$/;

const nameOrId = z.union([z.string(), z.number()]);

interface CreateInput {
  title: string; project: string | number;
  column?: string | number; assignee?: string | number;
  due?: string; description?: string;
}

export async function buildNewTask(resolver: Resolver, input: CreateInput): Promise<NewTask> {
  const projectId = await resolver.resolve({ kind: "project", value: input.project });
  const newTask: NewTask = { title: input.title, projectId };
  if (input.column !== undefined) newTask.boardColumnId = await resolver.resolve({ kind: "column", value: input.column, scope: { projectId } });
  if (input.assignee !== undefined) newTask.userId = await resolver.resolve({ kind: "member", value: input.assignee });
  if (input.due !== undefined) newTask.dayFrom = parseDueDate(input.due);
  if (input.description !== undefined) newTask.description = input.description;
  return newTask;
}

const createShape = {
  title: z.string(),
  project: nameOrId,
  column: nameOrId.optional(),
  assignee: nameOrId.optional(),
  due: z.string().optional(),
  description: z.string().optional(),
};

export function registerTaskTools({ server, client, resolver, attachPolicy, readPolicy }: ToolContext): void {
  server.registerTool(
    "weeek_list_projects",
    { description: "List WEEEK projects (id + name).", inputSchema: {} },
    async () => {
      try { return jsonReply(await client.projects.list()); }
      catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_list_tasks",
    {
      description:
        "List WEEEK tasks with server-side filters. Set allPages=true together with userId, startDate, and endDate to fetch every matching page inside the connector without returning unrelated workspace pages.",
      inputSchema: {
        projectId: z.number().int().optional(),
        userId: z.string().uuid().optional(),
        completed: z.boolean().optional(),
        startDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/).optional(),
        endDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/).optional(),
        sortBy: z.enum(["name", "type", "priority", "duration", "overdue", "created", "date", "start"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
        allPages: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        const query: Record<string, string | number | boolean> = {};
        if (args.projectId !== undefined) query.projectId = args.projectId;
        if (args.userId !== undefined) query.userId = args.userId;
        if (args.completed !== undefined) query.completed = args.completed ? 1 : 0;
        if (args.startDate !== undefined) query.startDate = args.startDate;
        if (args.endDate !== undefined) query.endDate = args.endDate;
        if (args.sortBy !== undefined) query.sortBy = args.sortBy;

        if ((args.startDate === undefined) !== (args.endDate === undefined)) {
          throw new Error("startDate and endDate must be provided together");
        }

        if (!args.allPages) {
          query.perPage = args.limit;
          query.offset = args.offset;
          return jsonReply(await client.tasks.list(query));
        }

        if (!args.userId || !args.startDate || !args.endDate) {
          throw new Error("allPages requires userId, startDate, and endDate so the connector never scans the full workspace");
        }

        const tasks: WeeekTask[] = [];
        let offset = args.offset;
        for (let page = 0; page < MAX_AUTO_PAGES; page++) {
          const batch = await client.tasks.list({ ...query, perPage: args.limit, offset });
          tasks.push(...batch);
          if (batch.length < args.limit) return jsonReply(tasks);
          offset += args.limit;
        }
        throw new Error(`allPages exceeded ${MAX_AUTO_PAGES} pages; narrow startDate/endDate to reduce the result set`);
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_get_task",
    { description: "Get one WEEEK task by id (includes its assignees).", inputSchema: { id: z.number().int() } },
    async (args) => {
      try { return jsonReply(await client.tasks.get(args.id)); }
      catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_get_attachment",
    {
      description:
        "Read one WEEEK attachment by id. For an image WEEEK hosts itself this returns the image, so a task whose requirements live in a screenshot can actually be read instead of guessed at from the surrounding text; anything else comes back as metadata. Ids come from a task's `attachments` list (weeek_get_task).",
      inputSchema: {
        id: z.string().regex(ATTACHMENT_ID, "attachment id must be an id, not a path"),
        metadataOnly: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        const attachment = await client.attachments.get(args.id);
        if (args.metadataOnly) return jsonReply({ attachment });
        if (attachment.service !== "weeek") {
          return jsonReply({
            attachment,
            note: `stored in ${attachment.service}, not in WEEEK; open its url directly — only weeek-hosted attachments can be read through this tool`,
          });
        }
        const { bytes, contentType } = await client.attachments.download({
          attachment,
          maxBytes: readPolicy.maxBytes,
        });
        // Never dump a binary into the conversation: only an image earns its bytes.
        if (!contentType.startsWith("image/")) {
          return jsonReply({ attachment, note: `not an image (${contentType}); its bytes are not returned` });
        }
        return imageReply(bytes, contentType);
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_list_members",
    {
      description:
        "List WEEEK workspace members (id + display name). Use to find the id for assigning a task to someone; pass that id as `assignee` to weeek_create_task.",
      inputSchema: {},
    },
    async () => {
      try { return jsonReply(await client.workspace.listMembers()); }
      catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_create_task",
    {
      description: "Create a WEEEK task. Accepts project/column/assignee by NAME or id, and a natural-language `due` date. One call — no need to look up ids first. Omit `assignee` to self-assign (WEEEK assigns the token owner); pass a member name/id to assign someone else. Reassigning an existing task is not supported by the WEEEK public API — set the assignee at creation.",
      inputSchema: createShape,
    },
    async (args) => {
      try {
        const newTask = await buildNewTask(resolver, args as CreateInput);
        return jsonReply(await client.tasks.create(newTask));
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
          const newTask = await buildNewTask(resolver, t as CreateInput);
          report.push({ ok: true, task: await client.tasks.create(newTask) });
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
        return jsonReply(await client.tasks.update(args.id, patch));
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
      try { return jsonReply(await client.tasks.remove(args.id)); }
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
        const bytes = await readFile(safePath);
        return jsonReply(await client.tasks.uploadAttachment({ taskId: args.task_id, filename: basename(safePath), bytes }));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_move_task",
    { description: "Move a WEEEK task to a column (by name or id, scoped to the given board) on that board.", inputSchema: { id: z.number().int(), board_id: z.number().int(), column: nameOrId } },
    async (args) => {
      try {
        const columnId = await resolver.resolve({ kind: "column", value: args.column, scope: { boardId: args.board_id } });
        return jsonReply(await client.tasks.move({ taskId: args.id, boardId: args.board_id, boardColumnId: columnId }));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_complete_task",
    { description: "Mark a WEEEK task complete, or reopen it (completed:false).", inputSchema: { id: z.number().int(), completed: z.boolean() } },
    async (args) => {
      try { return jsonReply(await client.tasks.setCompleted({ taskId: args.id, completed: args.completed })); }
      catch (err) { return errorReply(err); }
    },
  );
}
