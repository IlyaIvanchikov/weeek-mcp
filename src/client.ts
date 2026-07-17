import type { Config } from "./config.js";
import { WeeekApiError, WeeekTimeoutError } from "./errors.js";

export interface NamedEntity { id: number; name: string; }
export interface Member { id: string; name: string; }
export interface WeeekTask {
  id: number; title: string; description: string | null;
  projectId: number | null; boardColumnId: number | null; completed: boolean;
}
export interface CreateTaskBody {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
}
export interface Attachment { id: string; name: string; url: string; size: number; }

type Query = Record<string, string | number | undefined>;

export class WeeekClient {
  constructor(private cfg: Config, private fetchImpl: typeof fetch = fetch) {}

  private async request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    const url = new URL(this.cfg.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    // Multipart (file upload) bodies must NOT get a JSON content-type — fetch sets
    // the multipart boundary itself. JSON bodies keep the explicit header.
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.token}` };
    if (!isForm) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body:
          opts.body === undefined ? undefined
          : isForm ? (opts.body as FormData)
          : JSON.stringify(opts.body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new WeeekTimeoutError();
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new WeeekApiError(String(json.message ?? "WEEEK API error"), res.status, `http_${res.status}`);
    }
    return json as T;
  }

  private static pickArray(obj: Record<string, unknown>, key: string): unknown[] {
    const v = obj[key];
    if (Array.isArray(v)) return v;
    for (const value of Object.values(obj)) if (Array.isArray(value)) return value;
    return [];
  }

  private static toNamed(raw: any): NamedEntity {
    const name = raw.name ?? raw.title ??
      [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
    return { id: Number(raw.id), name: String(name ?? "") };
  }

  private static toMember(raw: any): Member {
    const joined = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
    const name = joined || raw.name || raw.email || String(raw.id ?? "");
    return { id: String(raw.id ?? ""), name: String(name) };
  }

  private static toTask(raw: any): WeeekTask {
    return {
      id: Number(raw.id),
      title: String(raw.title ?? ""),
      description: raw.description ?? null,
      projectId: raw.projectId == null ? null : Number(raw.projectId),
      boardColumnId: raw.boardColumnId == null ? null : Number(raw.boardColumnId),
      completed: Boolean(raw.isCompleted ?? raw.completed ?? false),
    };
  }

  async listProjects(): Promise<NamedEntity[]> {
    const j = await this.request<Record<string, unknown>>("GET", "/tm/projects");
    return WeeekClient.pickArray(j, "projects").map(WeeekClient.toNamed);
  }
  async listBoards(projectId: number): Promise<NamedEntity[]> {
    const j = await this.request<Record<string, unknown>>("GET", "/tm/boards", { query: { projectId } });
    return WeeekClient.pickArray(j, "boards").map(WeeekClient.toNamed);
  }
  async listColumns(boardId: number): Promise<NamedEntity[]> {
    const j = await this.request<Record<string, unknown>>("GET", "/tm/board-columns", { query: { boardId } });
    return WeeekClient.pickArray(j, "boardColumns").map(WeeekClient.toNamed);
  }
  async listMembers(): Promise<Member[]> {
    const j = await this.request<Record<string, unknown>>("GET", "/ws/members");
    return WeeekClient.pickArray(j, "members").map(WeeekClient.toMember);
  }
  async createTask(body: CreateTaskBody): Promise<WeeekTask> {
    const location: Record<string, number> = { projectId: body.projectId };
    if (body.boardColumnId !== undefined) location.boardColumnId = body.boardColumnId;
    const payload: Record<string, unknown> = { title: body.title, locations: [location] };
    if (body.description !== undefined) payload.description = body.description;
    if (body.userId !== undefined) payload.userId = body.userId;
    if (body.dayFrom !== undefined) payload.dayFrom = body.dayFrom;
    const j = await this.request<{ task: unknown }>("POST", "/tm/tasks", { body: payload });
    return WeeekClient.toTask(j.task);
  }
  async getTask(id: number): Promise<WeeekTask> {
    const j = await this.request<{ task: unknown }>("GET", `/tm/tasks/${id}`);
    return WeeekClient.toTask(j.task);
  }
  async listTasks(query: Query): Promise<WeeekTask[]> {
    const j = await this.request<Record<string, unknown>>("GET", "/tm/tasks", { query });
    return WeeekClient.pickArray(j, "tasks").map(WeeekClient.toTask);
  }
  async updateTask(id: number, patch: Record<string, unknown>): Promise<WeeekTask> {
    const j = await this.request<{ task: unknown }>("PUT", `/tm/tasks/${id}`, { body: patch });
    return WeeekClient.toTask(j.task);
  }
  async deleteTask(id: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("DELETE", `/tm/tasks/${id}`);
  }
  async attachFile(id: number, filename: string, data: Uint8Array | Blob): Promise<Attachment[]> {
    const form = new FormData();
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
    form.append("files[]", blob, filename);
    const j = await this.request<{ data?: unknown }>("POST", `/tm/tasks/${id}/attachments`, { body: form });
    return (Array.isArray(j.data) ? j.data : []) as Attachment[];
  }
  async moveTask(id: number, boardId: number, boardColumnId: number): Promise<WeeekTask> {
    await this.request("POST", `/tm/tasks/${id}/board`, { body: { boardId } });
    await this.request("POST", `/tm/tasks/${id}/board-column`, { body: { boardColumnId } });
    return this.getTask(id);
  }
  async setCompleted(id: number, completed: boolean): Promise<WeeekTask> {
    await this.request("POST", `/tm/tasks/${id}/${completed ? "complete" : "un-complete"}`, {});
    return this.getTask(id);
  }
}
