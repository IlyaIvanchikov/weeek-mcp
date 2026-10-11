import type { HttpClient, Query } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./shared.js";
import type { Attachment, CreateTaskBody, WeeekTask } from "./types.js";

export interface SetCompletedOptions { id: number; completed: boolean; }
export interface MoveTaskOptions { id: number; boardId: number; boardColumnId: number; }
export interface UploadAttachmentOptions { id: number; filename: string; data: Uint8Array | Blob; }

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
    const j = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    return pickArray(j, "tasks").map(toTask);
  }

  async create(body: CreateTaskBody): Promise<WeeekTask> {
    const location: Record<string, number> = { projectId: body.projectId };
    if (body.boardColumnId !== undefined) location.boardColumnId = body.boardColumnId;
    const payload: Record<string, unknown> = { title: body.title, locations: [location] };
    if (body.description !== undefined) payload.description = body.description;
    if (body.userId !== undefined) payload.userId = body.userId;
    if (body.dayFrom !== undefined) payload.dayFrom = body.dayFrom;
    const j = await this.http.execute<{ task: unknown }>(ops.create, { body: payload });
    return toTask(j.task);
  }

  async get(id: number): Promise<WeeekTask> {
    const j = await this.http.execute<{ task: unknown }>(ops.get, { params: { taskId: id } });
    return toTask(j.task);
  }

  async update(id: number, patch: Record<string, unknown>): Promise<WeeekTask> {
    const j = await this.http.execute<{ task: unknown }>(ops.update, { params: { taskId: id }, body: patch });
    return toTask(j.task);
  }

  async remove(id: number): Promise<{ success: boolean }> {
    return this.http.execute<{ success: boolean }>(ops.remove, { params: { taskId: id } });
  }

  async setCompleted({ id, completed }: SetCompletedOptions): Promise<WeeekTask> {
    await this.http.execute(completed ? ops.complete : ops.uncomplete, { params: { taskId: id } });
    return this.get(id);
  }

  // Two requests the API does not offer as one; if the second fails the task sits on the
  // new board in its old column (FOLLOWUPS #6).
  async move({ id, boardId, boardColumnId }: MoveTaskOptions): Promise<WeeekTask> {
    await this.http.execute(ops.changeBoard, { params: { taskId: id }, body: { boardId } });
    await this.http.execute(ops.changeColumn, { params: { taskId: id }, body: { boardColumnId } });
    return this.get(id);
  }

  async uploadAttachment({ id, filename, data }: UploadAttachmentOptions): Promise<Attachment[]> {
    const form = new FormData();
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
    form.append("files[]", blob, filename);
    const j = await this.http.execute<{ data?: unknown }>(ops.uploadAttachment, { params: { taskId: id }, body: form });
    // The spec documents `data` as one Attachment; accept a list too — `files[]` is a
    // multipart array and the live shape has not been pinned down (FOLLOWUPS #18).
    if (Array.isArray(j.data)) return j.data as Attachment[];
    return j.data ? [j.data as Attachment] : [];
  }
}
