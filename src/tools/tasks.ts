import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolContext } from "../toolsets/types.js";
import type { CustomField, NewTask, ProjectSummary, WeeekTask } from "../client.js";
import type { Resolver } from "../resolver.js";
import { resolveSafeAttachPath } from "../attach.js";
import { ResolutionError } from "../errors.js";
import { formatDayMonthYear, parseDay } from "../dates.js";
import type { TaskWithFields } from "../api/tasks.js";
import { taskPriorities, taskTypes } from "../api/constants.js";
import { priorityCode } from "../api/priority.js";
import { apiFlag } from "../api/requests.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, dayMonthYear, nameOrId, nameOrIdListCap, page, taskId } from "./inputs.js";
import { fieldValues, encodeFieldValues } from "./field-values.js";
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
  fields: fieldValues.optional(),
};
type CreateInput = z.infer<z.ZodObject<typeof createShape>>;

const updateShape = {
  id: taskId,
  title: z.string().optional(),
  due: z.string().optional(),
  start: z.string().optional(),
  priority: z.enum(taskPriorities).optional(),
  type: z.enum(taskTypes).optional(),
  duration: z.number().int().min(0).optional(),
  fields: fieldValues.optional(),
  tags: z.array(nameOrId).max(nameOrIdListCap).optional().describe("Replaces the task's tags; an empty list clears them."),
};
type UpdateInput = z.infer<z.ZodObject<typeof updateShape>>;

export async function buildNewTask(resolver: Resolver, input: CreateInput): Promise<NewTask> {
  const projectId = await resolver.resolve({ kind: "project", value: input.project });
  const newTask: NewTask = { title: input.title, projectId };
  if (input.column !== undefined) newTask.boardColumnId = await resolver.resolve({ kind: "column", value: input.column, scope: { projectId } });
  if (input.assignee !== undefined) newTask.userId = await resolver.resolve({ kind: "member", value: input.assignee });
  if (input.due !== undefined) newTask.day = formatDayMonthYear(parseDay(input.due));
  if (input.description !== undefined) newTask.description = input.description;
  if (input.priority !== undefined) newTask.priority = priorityCode(input.priority);
  if (input.type !== undefined) newTask.type = input.type;
  if (input.parent !== undefined) newTask.parentId = input.parent;
  if (input.fields !== undefined) {
    // A new task can carry global and project fields; a board's own fields are set with weeek_update_task once the task exists.
    const fields = [
      ...(await resolver.list({ kind: "customField" })),
      ...(await resolver.list({ kind: "customField", scope: { fieldScope: { kind: "project", projectId } } })),
    ];
    try {
      newTask.customFields = await encodeFieldValues({ resolver, fields, values: input.fields });
    } catch (err) {
      if (err instanceof ResolutionError && err.kind === "custom field") {
        throw new ResolutionError(err.kind, err.query, err.candidates, "a board's own fields can be set with weeek_update_task once the task exists");
      }
      throw err;
    }
  }
  return newTask;
}

export interface BuildTaskPatchOptions {
  resolver: Resolver;
  input: UpdateInput;
  /** The task as read for this update; needed when `fields` names fields or `start` comes without `due`, null otherwise. */
  current: TaskWithFields | null;
}

/** The task read for this update; the handler reads it only when a parameter needs it. */
function requireCurrent(current: TaskWithFields | null, parameter: string): TaskWithFields {
  if (current === null) throw new Error(`buildTaskPatch needs the task when \`${parameter}\` is given`);
  return current;
}

/** The due date a start date travels with: the API refuses a start date sent alone (FOLLOWUPS 21 b). */
function dueDateOf({ task }: TaskWithFields): string {
  if (task.dueDate === null) throw new Error("`start` needs a due date: pass `due` too — the task has none");
  return task.dueDate;
}

/** The PUT body for weeek_update_task: only the fields given, names resolved to ids. */
export async function buildTaskPatch({ resolver, input, current }: BuildTaskPatchOptions): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  // PUT /tm/tasks/{id} takes `dueDate` and `startDate` in Y-m-d; `dayFrom`, sent until 1.0.0, was ignored (FOLLOWUPS 21 b).
  if (input.due !== undefined) patch.dueDate = parseDay(input.due);
  if (input.start !== undefined) {
    patch.startDate = parseDay(input.start);
    if (input.due === undefined) patch.dueDate = dueDateOf(requireCurrent(current, "start"));
  }
  if (input.priority !== undefined) patch.priority = priorityCode(input.priority);
  if (input.type !== undefined) patch.type = input.type;
  if (input.duration !== undefined) patch.duration = input.duration;
  if (input.tags !== undefined) patch.tags = await Promise.all(input.tags.map((value) => resolver.resolve({ kind: "tag", value })));
  if (input.fields !== undefined) patch.customFields = await encodeFieldValues({ resolver, fields: requireCurrent(current, "fields").fields, values: input.fields });
  return patch;
}

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
  ...page,
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
    description: "List WEEEK projects: id, name, isPrivate, status and portfolioId. Use weeek_get_project for a project's description and team.",
    inputSchema: {},
  }, async () => (await client.projects.list()).map(({ id, name, isPrivate, status, portfolioId }): ProjectSummary => ({ id, name, isPrivate, status, portfolioId })));

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
    description: "Get one WEEEK task by id: assignees, watchers, parent and subtasks, priority, dates, tags, locations, time entries, attachments and custom-field values (`customFields`, option names shown).",
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
      "Create a WEEEK task. Accepts project/column/assignee by NAME or id, a natural-language `due` date, a priority (low, medium, high, hold), a type (action, meet, call), a `parent` task id for a subtask, and custom-field values in `fields` by field name (global and project fields). One call — no need to look up ids first. Omit `assignee` to self-assign; to change assignees later use weeek_add_assignees / weeek_remove_assignees.",
    inputSchema: createShape,
  }, async (args) => {
    const task = await client.tasks.create(await buildNewTask(resolver, args));
    // A board's fields are read off its tasks (CustomFieldsApi.list), so a task that lands on a board changes what the board lists.
    resolver.forget({ kind: "customField" });
    return task;
  });

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
      resolver.forget({ kind: "customField" });
      return jsonReply(report);
    },
  );

  registerJsonTool(server, "weeek_update_task", {
    description:
      "Update a WEEEK task: title, natural-language `due` and `start` dates (`start` goes with the due date — `due` or the task's own — because the API refuses one alone; some plans refuse start dates), priority (low, medium, high, hold), type (action, meet, call), `duration` in minutes, `tags` by name or id (replaces; an empty list clears), and `fields`: custom-field values by field name (options and members by name; null clears; other fields keep their values). Description is NOT updatable — the API ignores it; set it on create. Assignees, watchers, parent and projects have their own tools.",
    inputSchema: updateShape,
  }, async (args) => {
    const isTaskNeeded = args.fields !== undefined || (args.start !== undefined && args.due === undefined);
    const current = isTaskNeeded ? await client.tasks.getWithFields(args.id) : null;
    return client.tasks.update(args.id, await buildTaskPatch({ resolver, input: args, current }));
  });

  registerJsonTool(server, "weeek_delete_task", {
    description:
      "Permanently delete a WEEEK task by id. Irreversible — the task is removed, not just completed. Requires confirm:true; to merely close a task use weeek_complete_task instead.",
    inputSchema: { id: taskId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const removal = await client.tasks.remove(args.id);
    resolver.forget({ kind: "customField" });
    return removal;
  });

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
    const task = await client.tasks.move({ taskId: args.id, boardId: args.board_id, boardColumnId: columnId });
    resolver.forget({ kind: "customField" });
    return task;
  });

  registerJsonTool(server, "weeek_complete_task", {
    description: "Mark a WEEEK task complete, or reopen it (completed:false).",
    inputSchema: { id: taskId, completed: z.boolean() },
  }, async (args) => client.tasks.setCompleted({ taskId: args.id, completed: args.completed }));
}
