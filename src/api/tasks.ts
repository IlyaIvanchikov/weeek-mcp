import type { HttpClient, Query } from "../http.js";
import { operations } from "../operations.js";
import { apiFlag, attachmentForm, pickAttachments } from "./requests.js";
import { asRecord, isOneOf, pickArray, tagIdList } from "./responses.js";
import { priorityName } from "./priority.js";
import { taskTypes } from "./constants.js";
import { toCustomField, toFieldValue } from "./custom-fields.js";
import type { Attachment, BoardFieldSample, CommentsPage, CustomField, NewTask, SuccessResponse, TaskComment, TaskLocation, TimeEntry, TimeEntryFields, WeeekTask } from "./types.js";

export interface SetCompletedOptions { taskId: number; completed: boolean; }
export interface MoveTaskOptions { taskId: number; boardId: number; boardColumnId: number; }
export interface UploadAttachmentOptions { taskId: number; filename: string; bytes: Uint8Array | Blob; }
export interface ListCommentsOptions { taskId: number; limit?: number; offset?: number; }
export interface AddCommentOptions { taskId: number; markdown: string; parentId?: number; }
export interface CommentRef { taskId: number; commentId: number; }
export interface TaskMembersOptions { taskId: number; memberIds: string[]; }
export interface AddLocationOptions { taskId: number; projectId: number; boardColumnId?: number; }
export interface RemoveLocationOptions { taskId: number; projectId: number; }
export interface SetParentOptions { taskId: number; parentId: number | null; }
export interface AddTimeEntryOptions { taskId: number; entry: TimeEntryFields; }
export interface UpdateTimeEntryOptions { taskId: number; timeEntryId: string; entry: TimeEntryFields; }
export interface TimeEntryRef { taskId: number; timeEntryId: string; }

export interface TaskWithFields { task: WeeekTask; fields: CustomField[]; }

const ops = operations.tasks;

/**
 * How many of a board's tasks are read to find its fields: a board's own fields apply to every
 * task on it, so the intersection over a page cancels the fields that only some tasks carry
 * from their other locations.
 */
export const boardFieldSamplePageSize = 20;

const optionalNumber = (value: unknown): number | null => (value == null ? null : Number(value));
const optionalString = (value: unknown): string | null => (value == null ? null : String(value));

function toLocation(raw: unknown): TaskLocation {
  const r = asRecord(raw);
  return { projectId: Number(r.projectId), boardId: optionalNumber(r.boardId), boardColumnId: optionalNumber(r.boardColumnId) };
}

/** The spec wants isOvertime as 0 or 1 on the wire, not a boolean. */
function timeEntryBody(entry: TimeEntryFields) {
  return { ...entry, isOvertime: apiFlag(entry.isOvertime) };
}

export function toTimeEntry(raw: unknown): TimeEntry {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""), userId: String(r.userId ?? ""), date: String(r.date ?? ""),
    duration: Number(r.duration ?? 0), isOvertime: Boolean(r.isOvertime), comment: r.comment == null ? "" : String(r.comment),
  };
}

function toComment(raw: unknown): TaskComment {
  const r = asRecord(raw);
  return {
    id: Number(r.id), parentId: optionalNumber(r.parentId), authorId: String(r.authorId ?? ""),
    markdown: String(r.markdown ?? ""), createdAt: String(r.createdAt ?? ""), updatedAt: String(r.updatedAt ?? ""),
  };
}

function fieldsOf(rawTask: unknown): CustomField[] {
  const fields = asRecord(rawTask).customFields;
  return Array.isArray(fields) ? fields.map(toCustomField) : [];
}

export function toTask(raw: unknown): WeeekTask {
  const r = asRecord(raw);
  return {
    id: Number(r.id),
    title: String(r.title ?? ""),
    description: r.description == null ? null : String(r.description),
    projectId: optionalNumber(r.projectId),
    boardId: optionalNumber(r.boardId),
    boardColumnId: optionalNumber(r.boardColumnId),
    parentId: optionalNumber(r.parentId),
    subTasks: Array.isArray(r.subTasks) ? r.subTasks.map(Number) : [],
    assignees: Array.isArray(r.assignees) ? r.assignees.map(String) : [],
    // The API calls watchers "subscribers" on the task and "watchers" on the endpoint that sets them.
    watchers: Array.isArray(r.subscribers) ? r.subscribers.map(String) : [],
    authorId: optionalString(r.authorId),
    priority: priorityName(r.priority),
    type: isOneOf(taskTypes, r.type) ? r.type : null,
    startDate: optionalString(r.startDate),
    dueDate: optionalString(r.dueDate),
    completed: Boolean(r.isCompleted ?? r.completed ?? false),
    completedAt: optionalString(r.completedAt),
    createdAt: optionalString(r.createdAt),
    duration: optionalNumber(r.duration),
    tags: tagIdList(r.tags),
    locations: Array.isArray(r.locations) ? r.locations.map(toLocation) : [],
    timeEntries: Array.isArray(r.timeEntries) ? r.timeEntries.map(toTimeEntry) : [],
    // The API returns these with every task; surfacing them is what lets a caller see a
    // screenshot-only description instead of silently working from the prose.
    attachments: Array.isArray(r.attachments) ? (r.attachments as Attachment[]) : [],
    customFields: Array.isArray(r.customFields) ? r.customFields.map(toFieldValue) : [],
  };
}

export class TasksApi {
  constructor(private http: HttpClient) {}

  async list(query: Query): Promise<WeeekTask[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    return pickArray(json, "tasks").map(toTask);
  }

  async create(newTask: NewTask): Promise<WeeekTask> {
    const location: Record<string, number> = { projectId: newTask.projectId };
    if (newTask.boardColumnId !== undefined) location.boardColumnId = newTask.boardColumnId;
    const payload: Record<string, unknown> = { title: newTask.title, locations: [location] };
    if (newTask.description !== undefined) payload.description = newTask.description;
    if (newTask.userId !== undefined) payload.userId = newTask.userId;
    if (newTask.day !== undefined) payload.day = newTask.day;
    if (newTask.priority !== undefined) payload.priority = newTask.priority;
    if (newTask.type !== undefined) payload.type = newTask.type;
    if (newTask.parentId !== undefined) payload.parentId = newTask.parentId;
    if (newTask.customFields !== undefined) payload.customFields = newTask.customFields;
    const json = await this.http.execute<{ task: unknown }>(ops.create, { body: payload });
    return toTask(json.task);
  }

  /**
   * The task and its fields with their options, off one GET: what weeek_update_task resolves a
   * field value by name against, and where it reads the due date a start date must travel with.
   */
  async getWithFields(taskId: number): Promise<TaskWithFields> {
    const json = await this.http.execute<{ task: unknown }>(ops.get, { params: { taskId } });
    return { task: toTask(json.task), fields: fieldsOf(json.task) };
  }

  /**
   * A page of the board's tasks, with every task state, as the only readable source of a board's
   * fields (see CustomFieldsApi.list): the fields every one of them carries, and every project
   * they sit in. Null when the board has no task at all.
   */
  async sampleBoardFields(boardId: number): Promise<BoardFieldSample | null> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query: { boardId, perPage: boardFieldSamplePageSize, all: 1 } });
    const rawTasks = pickArray(json, "tasks");
    const [firstTask, ...otherTasks] = rawTasks;
    if (firstTask === undefined) return null;
    const idsOfOtherTasks = otherTasks.map((rawTask) => new Set(fieldsOf(rawTask).map((field) => field.id)));
    const fields = fieldsOf(firstTask).filter((field) => idsOfOtherTasks.every((ids) => ids.has(field.id)));
    const projectIds = new Set<number>();
    for (const rawTask of rawTasks) {
      const task = toTask(rawTask);
      const taskProjectIds = task.locations.length > 0 ? task.locations.map((location) => location.projectId) : [task.projectId];
      for (const projectId of taskProjectIds) if (projectId !== null) projectIds.add(projectId);
    }
    return { projectIds: [...projectIds], fields };
  }

  async get(id: number): Promise<WeeekTask> {
    const json = await this.http.execute<{ task: unknown }>(ops.get, { params: { taskId: id } });
    return toTask(json.task);
  }

  async update(id: number, patch: Record<string, unknown>): Promise<WeeekTask> {
    const json = await this.http.execute<{ task: unknown }>(ops.update, { params: { taskId: id }, body: patch });
    return toTask(json.task);
  }

  async remove(id: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { taskId: id } });
  }

  async setCompleted({ taskId, completed }: SetCompletedOptions): Promise<WeeekTask> {
    await this.http.execute(completed ? ops.complete : ops.uncomplete, { params: { taskId } });
    return this.get(taskId);
  }

  // Two requests the API does not offer as one; if the second fails the task sits on the
  // new board in its old column (FOLLOWUPS #6).
  async move({ taskId, boardId, boardColumnId }: MoveTaskOptions): Promise<WeeekTask> {
    await this.http.execute(ops.changeBoard, { params: { taskId }, body: { boardId } });
    await this.http.execute(ops.changeColumn, { params: { taskId }, body: { boardColumnId } });
    return this.get(taskId);
  }

  async uploadAttachment({ taskId, filename, bytes }: UploadAttachmentOptions): Promise<Attachment[]> {
    const json = await this.http.execute<{ data?: unknown }>(ops.uploadAttachment, { params: { taskId }, body: attachmentForm({ filename, bytes }) });
    return pickAttachments(json);
  }

  async listComments({ taskId, limit, offset }: ListCommentsOptions): Promise<CommentsPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.listComments, { params: { taskId }, query: { limit, offset } });
    return { comments: pickArray(json, "comments").map(toComment), hasMore: Boolean(json.hasMore) };
  }

  async addComment({ taskId, markdown, parentId }: AddCommentOptions): Promise<TaskComment> {
    const body: Record<string, unknown> = { markdown };
    if (parentId !== undefined) body.parentId = parentId;
    const json = await this.http.execute<{ comment: unknown }>(ops.addComment, { params: { taskId }, body });
    return toComment(json.comment);
  }

  async removeComment({ taskId, commentId }: CommentRef): Promise<SuccessResponse> {
    // The API answers 204 with no body; the envelope every other delete returns is built here, once.
    await this.http.execute(ops.removeComment, { params: { taskId, commentId } });
    return { success: true };
  }

  async addAssignees({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.addAssignees, { params: { taskId }, body: { assignees: memberIds } });
    return this.get(taskId);
  }

  async removeAssignees({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.removeAssignees, { params: { taskId }, body: { assignees: memberIds } });
    return this.get(taskId);
  }

  async addWatchers({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.addWatchers, { params: { taskId }, body: { watchers: memberIds } });
    return this.get(taskId);
  }

  async removeWatchers({ taskId, memberIds }: TaskMembersOptions): Promise<WeeekTask> {
    await this.http.execute(ops.removeWatchers, { params: { taskId }, body: { watchers: memberIds } });
    return this.get(taskId);
  }

  async addLocation({ taskId, projectId, boardColumnId }: AddLocationOptions): Promise<WeeekTask> {
    const body: Record<string, unknown> = { projectId };
    if (boardColumnId !== undefined) body.boardColumnId = boardColumnId;
    await this.http.execute(ops.addLocation, { params: { taskId }, body });
    return this.get(taskId);
  }

  async removeLocation({ taskId, projectId }: RemoveLocationOptions): Promise<WeeekTask> {
    await this.http.execute(ops.removeLocation, { params: { taskId }, body: { projectId } });
    return this.get(taskId);
  }

  async setParent({ taskId, parentId }: SetParentOptions): Promise<WeeekTask> {
    // parentId: null is how the API detaches a subtask, so the key is always sent.
    await this.http.execute(ops.setParent, { params: { taskId }, body: { parentId } });
    return this.get(taskId);
  }

  async startTimer(taskId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.startTimer, { params: { taskId } });
  }

  async stopTimer(taskId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.stopTimer, { params: { taskId } });
  }

  async addTimeEntry({ taskId, entry }: AddTimeEntryOptions): Promise<TimeEntry> {
    const json = await this.http.execute<{ data: unknown }>(ops.addTimeEntry, { params: { taskId }, body: timeEntryBody(entry) });
    return toTimeEntry(json.data);
  }

  async updateTimeEntry({ taskId, timeEntryId, entry }: UpdateTimeEntryOptions): Promise<TimeEntry> {
    const json = await this.http.execute<{ data: unknown }>(ops.updateTimeEntry, { params: { taskId, timeEntryId }, body: timeEntryBody(entry) });
    return toTimeEntry(json.data);
  }

  async removeTimeEntry({ taskId, timeEntryId }: TimeEntryRef): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeTimeEntry, { params: { taskId, timeEntryId } });
  }
}
