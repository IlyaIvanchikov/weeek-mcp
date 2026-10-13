import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolContext } from "../toolsets/types.js";
import type { NewTask, TaskPriority, TaskType, WeeekTask } from "../client.js";
import type { Resolver } from "../resolver.js";
import { resolveSafeAttachPath } from "../attach.js";
import { parseDay } from "../dates.js";
import { taskPriorities, taskTypes } from "../api/constants.js";
import { priorityCode } from "../api/priority.js";
import { apiFlag } from "../api/requests.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, dayMonthYear, nameOrId, nameOrIdList, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
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

interface CreateInput {
  title: string; project: string | number;
  column?: string | number; assignee?: string | number;
  due?: string; description?: string;
  priority?: TaskPriority; type?: TaskType; parent?: number;
}

export async function buildNewTask(resolver: Resolver, input: CreateInput): Promise<NewTask> {
  const projectId = await resolver.resolve({ kind: "project", value: input.project });
  const newTask: NewTask = { title: input.title, projectId };
  if (input.column !== undefined) newTask.boardColumnId = await resolver.resolve({ kind: "column", value: input.column, scope: { projectId } });
  if (input.assignee !== undefined) newTask.userId = await resolver.resolve({ kind: "member", value: input.assignee });
  if (input.due !== undefined) newTask.dayFrom = parseDay(input.due);
  if (input.description !== undefined) newTask.description = input.description;
  if (input.priority !== undefined) newTask.priority = priorityCode(input.priority);
  if (input.type !== undefined) newTask.type = input.type;
  if (input.parent !== undefined) newTask.parentId = input.parent;
  return newTask;
}

interface UpdateInput {
  title?: string; due?: string; start?: string;
  priority?: TaskPriority; type?: TaskType; duration?: number;
  tags?: Array<string | number>;
}

/** The PUT body for weeek_update_task: only the fields given, names resolved to ids. */
export async function buildTaskPatch(resolver: Resolver, input: UpdateInput): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  // `dayFrom` has set the due date since 0.1 although the spec names the field `dueDate`;
  // the Phase 2 live smoke settles which one the API honours (FOLLOWUPS).
  if (input.due !== undefined) patch.dayFrom = parseDay(input.due);
  if (input.start !== undefined) patch.startDate = parseDay(input.start);
  if (input.priority !== undefined) patch.priority = priorityCode(input.priority);
  if (input.type !== undefined) patch.type = input.type;
  if (input.duration !== undefined) patch.duration = input.duration;
  if (input.tags !== undefined) patch.tags = await Promise.all(input.tags.map((value) => resolver.resolve({ kind: "tag", value })));
  return patch;
}

const createShape = {
  title: z.string(),
  project: nameOrId,
  column: nameOrId.optional(),
  assignee: nameOrId.optional(),
  due: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(taskPriorities).optional(),
  type: z.enum(taskTypes).optional(),
  parent: z.number().int().optional().describe("Id of the task this one becomes a subtask of."),
};

const listShape = {
  projectId: z.number().int().optional(),
  boardId: z.number().int().optional(),
  boardColumnId: z.number().int().optional(),
  userId: z.string().uuid().optional(),
  completed: z.boolean().optional(),
  all: z.boolean().optional().describe("Include completed and deleted tasks; when set, `completed` is ignored."),
  search: z.string().min(1).optional().describe("Text to find in titles and descriptions."),
  priority: z.enum(taskPriorities).optional(),
  type: z.enum(taskTypes).optional(),
  day: dayMonthYear.optional(),
  startDate: dayMonthYear.optional(),
  endDate: dayMonthYear.optional(),
  completedAtFrom: dayMonthYear.optional(),
  completedAtTo: dayMonthYear.optional(),
  sortBy: z.enum(["name", "type", "priority", "duration", "overdue", "created", "date", "start"]).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  allPages: z.boolean().default(false),
};
type ListArgs = z.infer<z.ZodObject<typeof listShape>>;

/** The server-side filters of weeek_list_tasks as the API spells them; paging is added by the caller. */
export function buildTaskQuery(args: ListArgs): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  if (args.projectId !== undefined) query.projectId = args.projectId;
  if (args.boardId !== undefined) query.boardId = args.boardId;
  if (args.boardColumnId !== undefined) query.boardColumnId = args.boardColumnId;
  if (args.userId !== undefined) query.userId = args.userId;
  if (args.completed !== undefined) query.completed = apiFlag(args.completed);
  if (args.all !== undefined) query.all = apiFlag(args.all);
  if (args.search !== undefined) query.search = args.search;
  if (args.priority !== undefined) query.priority = priorityCode(args.priority);
  if (args.type !== undefined) query.type = args.type;
  if (args.day !== undefined) query.day = args.day;
  if (args.startDate !== undefined) query.startDate = args.startDate;
  if (args.endDate !== undefined) query.endDate = args.endDate;
  if (args.completedAtFrom !== undefined) query.completedAtFrom = args.completedAtFrom;
  if (args.completedAtTo !== undefined) query.completedAtTo = args.completedAtTo;
  if (args.sortBy !== undefined) query.sortBy = args.sortBy;
  return query;
}

export function registerTaskTools({ server, client, resolver, attachPolicy, readPolicy }: ToolContext): void {
  registerJsonTool(server, "weeek_list_projects", {
    description: "List WEEEK projects: id, name, description, privacy, status, portfolio and team member ids.",
    inputSchema: {},
  }, async () => client.projects.list());

  registerJsonTool(server, "weeek_list_boards", {
    description: "List the boards of a WEEEK project (by name or id): id, name, privacy. Use it to find a board for weeek_move_task or weeek_list_columns.",
    inputSchema: { project: nameOrId },
  }, async (args) => client.boards.list(await resolver.resolve({ kind: "project", value: args.project })));

  registerJsonTool(server, "weeek_list_columns", {
    description: "List the columns of a WEEEK board: id, name, boardId. Pass the board by id, or by name together with its `project`.",
    inputSchema: { board: nameOrId, project: nameOrId.optional() },
  }, async (args) => {
    const projectId = args.project === undefined ? undefined : await resolver.resolve({ kind: "project", value: args.project });
    const boardId = await resolver.resolve({ kind: "board", value: args.board, scope: { projectId } });
    return client.columns.list(boardId);
  });

  registerJsonTool(server, "weeek_list_tasks", {
    description:
      "List WEEEK tasks with server-side filters: project, board, column, assignee (userId), completion, free-text `search`, priority, type, a single `day` or a startDate–endDate range (dd.mm.yyyy), completion dates. Set allPages=true together with userId, startDate, and endDate to fetch every matching page inside the connector without returning unrelated workspace pages.",
    inputSchema: listShape,
  }, async (args) => {
    if ((args.startDate === undefined) !== (args.endDate === undefined)) {
      throw new Error("startDate and endDate must be provided together");
    }
    const query = buildTaskQuery(args);
    if (!args.allPages) return client.tasks.list({ ...query, perPage: args.limit, offset: args.offset });
    if (!args.userId || !args.startDate || !args.endDate) {
      throw new Error("allPages requires userId, startDate, and endDate so the connector never scans the full workspace");
    }
    const tasks: WeeekTask[] = [];
    let offset = args.offset;
    for (let page = 0; page < MAX_AUTO_PAGES; page++) {
      const batch = await client.tasks.list({ ...query, perPage: args.limit, offset });
      tasks.push(...batch);
      if (batch.length < args.limit) return tasks;
      offset += args.limit;
    }
    throw new Error(`allPages exceeded ${MAX_AUTO_PAGES} pages; narrow startDate/endDate to reduce the result set`);
  });

  registerJsonTool(server, "weeek_get_task", {
    description: "Get one WEEEK task by id: assignees, watchers, parent and subtasks, priority, dates, tags, locations, time entries and attachments.",
    inputSchema: { id: taskId },
  }, async (args) => client.tasks.get(args.id));

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

  registerJsonTool(server, "weeek_list_members", {
    description:
      "List WEEEK workspace members (id + display name). Any tool that takes an assignee, watcher or member accepts these names directly; use this to see who exists.",
    inputSchema: {},
  }, async () => client.workspace.listMembers());

  registerJsonTool(server, "weeek_create_task", {
    description:
      "Create a WEEEK task. Accepts project/column/assignee by NAME or id, a natural-language `due` date, a priority (low, medium, high, hold), a type (action, meet, call) and a `parent` task id for a subtask. One call — no need to look up ids first. Omit `assignee` to self-assign; to change assignees later use weeek_add_assignees / weeek_remove_assignees.",
    inputSchema: createShape,
  }, async (args) => client.tasks.create(await buildNewTask(resolver, args)));

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
          const newTask = await buildNewTask(resolver, t);
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

  registerJsonTool(server, "weeek_update_task", {
    description:
      "Update a WEEEK task: title, natural-language `due` and `start` dates, priority (low, medium, high, hold), type (action, meet, call), `duration` estimate in minutes, and `tags` by name or id (replaces the task's tags). NOTE: description is NOT updatable — WEEEK's API silently ignores it on update; set it at create time or in the UI. Assignees, watchers, parent and projects have their own tools.",
    inputSchema: {
      id: taskId,
      title: z.string().optional(),
      due: z.string().optional(),
      start: z.string().optional(),
      priority: z.enum(taskPriorities).optional(),
      type: z.enum(taskTypes).optional(),
      duration: z.number().int().min(0).optional(),
      tags: nameOrIdList.optional(),
    },
  }, async (args) => client.tasks.update(args.id, await buildTaskPatch(resolver, args)));

  registerJsonTool(server, "weeek_delete_task", {
    description:
      "Permanently delete a WEEEK task by id. Irreversible — the task is removed, not just completed. Requires confirm:true; to merely close a task use weeek_complete_task instead.",
    inputSchema: { id: taskId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.remove(args.id));

  registerJsonTool(server, "weeek_attach_file", {
    description:
      "Attach a local file to a WEEEK task. For safety only files inside the allowed directory (the server's working directory by default, or WEEEK_ATTACH_DIR if set) — and its subfolders — may be attached; paths outside it are refused.",
    inputSchema: { task_id: taskId, path: z.string() },
    annotations: { openWorldHint: true },
  }, async (args) => {
    const safePath = await resolveSafeAttachPath(args.path, attachPolicy);
    const bytes = await readFile(safePath);
    return client.tasks.uploadAttachment({ taskId: args.task_id, filename: basename(safePath), bytes });
  });

  registerJsonTool(server, "weeek_move_task", {
    description: "Move a WEEEK task to a column (by name or id, scoped to the given board) on that board. Find board ids with weeek_list_boards.",
    inputSchema: { id: taskId, board_id: z.number().int(), column: nameOrId },
  }, async (args) => {
    const columnId = await resolver.resolve({ kind: "column", value: args.column, scope: { boardId: args.board_id } });
    return client.tasks.move({ taskId: args.id, boardId: args.board_id, boardColumnId: columnId });
  });

  registerJsonTool(server, "weeek_complete_task", {
    description: "Mark a WEEEK task complete, or reopen it (completed:false).",
    inputSchema: { id: taskId, completed: z.boolean() },
  }, async (args) => client.tasks.setCompleted({ taskId: args.id, completed: args.completed }));
}
