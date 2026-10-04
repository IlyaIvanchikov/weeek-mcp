import type { Config } from "./config.js";
import { WeeekApiError, WeeekAuthError, WeeekTimeoutError } from "./errors.js";

export interface NamedEntity { id: number; name: string; }
export interface Member { id: string; name: string; }
export interface WeeekTask {
  id: number; title: string; description: string | null;
  projectId: number | null; boardId: number | null; boardColumnId: number | null;
  assignees: string[]; dueDate: string | null; completed: boolean;
  attachments: Attachment[];
}
export interface CreateTaskBody {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
}
// WEEEK stores an attachment either itself ("weeek") or in a third-party drive.
// The vocabulary is closed, so it is a closed type: a new service must fail the
// type check at every branch that reads it rather than fall through silently.
export const attachmentServices = ["weeek", "google_drive", "dropbox", "one_drive", "box"] as const;
export type AttachmentService = (typeof attachmentServices)[number];

export interface Attachment {
  id: string;
  creatorId: string;
  service: AttachmentService;
  name: string;
  /** Temporary URL. When `service` is "weeek" it is valid for one hour. */
  url: string;
  /** Present only when `service` is "weeek". */
  size?: number;
  createdAt: string;
}

export interface AttachmentBytes { bytes: Uint8Array; contentType: string; }
export interface DownloadAttachmentOptions { attachment: Attachment; maxBytes: number; }

type Query = Record<string, string | number | boolean | undefined>;

export class WeeekClient {
  constructor(private cfg: Config, private fetchImpl: typeof fetch = fetch) {}

  private async request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    // Tools are listed without a token; the token is required only once a tool
    // actually calls the API. Fail clearly here instead of sending an unauthed request.
    if (!this.cfg.token) throw new WeeekAuthError();
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
      boardId: raw.boardId == null ? null : Number(raw.boardId),
      boardColumnId: raw.boardColumnId == null ? null : Number(raw.boardColumnId),
      // WEEEK assigns the task creator by default; the public API exposes assignees
      // only as read-only here (no reachable endpoint mutates them after creation).
      assignees: Array.isArray(raw.assignees) ? raw.assignees.map(String) : [],
      dueDate: raw.dueDate == null ? null : String(raw.dueDate),
      completed: Boolean(raw.isCompleted ?? raw.completed ?? false),
      // The API returns these with every task; surfacing them is what lets a caller
      // see a screenshot-only description instead of silently working from the prose.
      attachments: Array.isArray(raw.attachments) ? (raw.attachments as Attachment[]) : [],
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
    // The spec documents `data` as one Attachment object; accept a list too, since
    // `files[]` is a multipart array and the live response has not been pinned down.
    if (Array.isArray(j.data)) return j.data as Attachment[];
    return j.data ? [j.data as Attachment] : [];
  }
  async getAttachment(id: string): Promise<Attachment> {
    const j = await this.request<{ data?: unknown }>("GET", `/ws/attachments/${id}`);
    return j.data as Attachment;
  }

  /**
   * Fetch an attachment's bytes from the URL its metadata carries.
   *
   * The URL is pre-signed (`expires` + `signature`), so no token is sent — not to WEEEK and
   * not to the storage host WEEEK redirects to (an S3 bucket, with its own one-hour signed
   * link). Security rules, in order:
   *   1. only "weeek"-hosted attachments are downloaded at all; a third-party `service`
   *      points at that vendor's host and comes back as metadata only;
   *   2. the first hop must sit on the configured API origin;
   *   3. the redirect is followed by hand, exactly once, and only to https — so where the
   *      bytes come from is decided here, not by fetch's redirect policy;
   *   4. the size is capped before the request when declared, and again on the body,
   *      refusing loudly instead of truncating.
   */
  async downloadAttachment({ attachment, maxBytes }: DownloadAttachmentOptions): Promise<AttachmentBytes> {
    if (attachment.service !== "weeek") {
      throw new Error(
        `attachment ${attachment.id} is stored in ${attachment.service}; only weeek-hosted attachments can be downloaded`,
      );
    }
    const apiOrigin = new URL(this.cfg.baseUrl).origin;
    let url: URL;
    try {
      url = new URL(attachment.url);
    } catch {
      throw new Error(`attachment ${attachment.id} has an unusable url`);
    }
    if (url.origin !== apiOrigin) {
      throw new Error(`attachment ${attachment.id} url origin ${url.origin} is not the WEEEK API origin ${apiOrigin}`);
    }
    if (attachment.size !== undefined && attachment.size > maxBytes) {
      throw new Error(`attachment ${attachment.id} is too large (${attachment.size} > ${maxBytes} bytes)`);
    }

    let res = await this.fetchUnauthenticated(url, attachment.id);
    if (WeeekClient.isRedirect(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`attachment ${attachment.id}: WEEEK redirected without a location`);
      const target = new URL(location, url);
      if (target.protocol !== "https:") {
        throw new Error(`attachment ${attachment.id}: refusing a redirect to non-https ${target.origin}`);
      }
      res = await this.fetchUnauthenticated(target, attachment.id);
      if (WeeekClient.isRedirect(res.status)) {
        throw new Error(`attachment ${attachment.id}: the storage host answered with another redirect; only one is followed`);
      }
    }
    if (!res.ok) {
      throw new WeeekApiError(`could not download attachment ${attachment.id}`, res.status, `http_${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(`attachment ${attachment.id} is too large (${bytes.byteLength} > ${maxBytes} bytes)`);
    }
    return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  private static isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  // A GET with no credentials and no automatic redirect. A transport failure is reported
  // with the host and undici's cause code: "fetch failed" alone has cost real debugging time
  // when a VPN routed the storage host into a black hole.
  private async fetchUnauthenticated(url: URL, attachmentId: string): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      return await this.fetchImpl(url, { method: "GET", redirect: "manual", signal: ctrl.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new WeeekTimeoutError();
      const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err instanceof Error ? err.message : String(err));
      throw new Error(
        `could not reach ${url.host} (${cause}) while downloading attachment ${attachmentId}; if you are on a VPN, the storage host may be routed through it`,
      );
    } finally {
      clearTimeout(timer);
    }
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
