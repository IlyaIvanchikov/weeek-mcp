import type { HttpClient, Query } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import { priorityName } from "./priority.js";
import { taskTypes } from "./constants.js";
import type { Attachment, CommentsPage, NewTask, SuccessResponse, TaskComment, TaskLocation, TaskType, TimeEntry, TimeEntryFields, WeeekTask } from "./types.js";

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

const ops = operations.tasks;

const optionalNumber = (value: unknown): number | null => (value == null ? null : Number(value));
const optionalString = (value: unknown): string | null => (value == null ? null : String(value));

function toLocation(raw: any): TaskLocation {
  return { projectId: Number(raw.projectId), boardId: optionalNumber(raw.boardId), boardColumnId: optionalNumber(raw.boardColumnId) };
}

export function toTimeEntry(raw: any): TimeEntry {
  return {
    id: String(raw.id ?? ""), userId: String(raw.userId ?? ""), date: String(raw.date ?? ""),
    duration: Number(raw.duration ?? 0), isOvertime: Boolean(raw.isOvertime), comment: raw.comment == null ? "" : String(raw.comment),
  };
}

function toComment(raw: any): TaskComment {
  return {
    id: Number(raw.id), parentId: optionalNumber(raw.parentId), authorId: String(raw.authorId ?? ""),
    markdown: String(raw.markdown ?? ""), createdAt: String(raw.createdAt ?? ""), updatedAt: String(raw.updatedAt ?? ""),
  };
}

function toTask(raw: any): WeeekTask {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    description: raw.description ?? null,
    projectId: optionalNumber(raw.projectId),
    boardId: optionalNumber(raw.boardId),
    boardColumnId: optionalNumber(raw.boardColumnId),
    parentId: optionalNumber(raw.parentId),
    subTasks: Array.isArray(raw.subTasks) ? raw.subTasks.map(Number) : [],
    assignees: Array.isArray(raw.assignees) ? raw.assignees.map(String) : [],
    // The API calls watchers "subscribers" on the task and "watchers" on the endpoint that sets them.
    watchers: Array.isArray(raw.subscribers) ? raw.subscribers.map(String) : [],
    authorId: optionalString(raw.authorId),
    priority: priorityName(raw.priority),
    type: (taskTypes as readonly string[]).includes(raw.type) ? (raw.type as TaskType) : null,
    startDate: optionalString(raw.startDate),
    dueDate: optionalString(raw.dueDate),
    completed: Boolean(raw.isCompleted ?? raw.completed ?? false),
    completedAt: optionalString(raw.completedAt),
    createdAt: optionalString(raw.createdAt),
    duration: optionalNumber(raw.duration),
    tags: Array.isArray(raw.tags) ? raw.tags.map(Number) : [],
    locations: Array.isArray(raw.locations) ? raw.locations.map(toLocation) : [],
    timeEntries: Array.isArray(raw.timeEntries) ? raw.timeEntries.map(toTimeEntry) : [],
    // The API returns these with every task; surfacing them is what lets a caller see a
    // screenshot-only description instead of silently working from the prose.
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as Attachment[]) : [],
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
    if (newTask.dayFrom !== undefined) payload.dayFrom = newTask.dayFrom;
    if (newTask.priority !== undefined) payload.priority = newTask.priority;
    if (newTask.type !== undefined) payload.type = newTask.type;
    if (newTask.parentId !== undefined) payload.parentId = newTask.parentId;
    const json = await this.http.execute<{ task: unknown }>(ops.create, { body: payload });
    return toTask(json.task);
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
    const form = new FormData();
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart]);
    form.append("files[]", blob, filename);
    const json = await this.http.execute<{ data?: unknown }>(ops.uploadAttachment, { params: { taskId }, body: form });
    // The spec documents `data` as one Attachment; accept a list too — `files[]` is a
    // multipart array and the live shape has not been pinned down (FOLLOWUPS #18).
    if (Array.isArray(json.data)) return json.data as Attachment[];
    return json.data ? [json.data as Attachment] : [];
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

  async removeComment({ taskId, commentId }: CommentRef): Promise<void> {
    await this.http.execute(ops.removeComment, { params: { taskId, commentId } });
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
    const json = await this.http.execute<{ data: unknown }>(ops.addTimeEntry, { params: { taskId }, body: entry });
    return toTimeEntry(json.data);
  }

  async updateTimeEntry({ taskId, timeEntryId, entry }: UpdateTimeEntryOptions): Promise<TimeEntry> {
    const json = await this.http.execute<{ data: unknown }>(ops.updateTimeEntry, { params: { taskId, timeEntryId }, body: entry });
    return toTimeEntry(json.data);
  }

  async removeTimeEntry({ taskId, timeEntryId }: TimeEntryRef): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeTimeEntry, { params: { taskId, timeEntryId } });
  }
}
