import type { HttpClient, Query } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { Attachment, NewTask, WeeekTask } from "./types.js";

export interface SetCompletedOptions { taskId: number; completed: boolean; }
export interface MoveTaskOptions { taskId: number; boardId: number; boardColumnId: number; }
export interface UploadAttachmentOptions { taskId: number; filename: string; bytes: Uint8Array | Blob; }

const ops = operations.tasks;

function toTask(raw: any): WeeekTask {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    description: raw.description ?? null,
    projectId: raw.projectId == null ? null : Number(raw.projectId),
    boardId: raw.boardId == null ? null : Number(raw.boardId),
    boardColumnId: raw.boardColumnId == null ? null : Number(raw.boardColumnId),
    // WEEEK assigns the task creator by default; assignees are read-only on this shape.
    assignees: Array.isArray(raw.assignees) ? raw.assignees.map(String) : [],
    dueDate: raw.dueDate == null ? null : String(raw.dueDate),
    completed: Boolean(raw.isCompleted ?? raw.completed ?? false),
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

  async remove(id: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { taskId: id } });
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
}
