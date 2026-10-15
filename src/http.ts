import type { Config } from "./config.js";
import type { Operation } from "./operations.js";
import { WeeekApiError, WeeekAuthError, WeeekTimeoutError } from "./errors.js";

export type HttpConfig = Pick<Config, "token" | "baseUrl" | "timeoutMs">;
export type Query = Record<string, string | number | boolean | undefined>;
export type PathParams = Record<string, string | number>;
export interface ExecuteOptions { params?: PathParams; query?: Query; body?: unknown; }
export interface BinaryResponse { bytes: Uint8Array; contentType: string; }

/**
 * Fill `{name}` placeholders. Values are URL-encoded because they can be anything the
 * model passed through — a resolved id today, a search term tomorrow — and a missing
 * parameter is a programming error, so it throws instead of sending a literal "{taskId}".
 */
export function fillPath(template: string, params: PathParams = {}): string {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path parameter "${name}" for ${template}`);
    const text = String(value);
    // The URL parser resolves dot segments, and an empty segment drops the id, so either
    // would change which endpoint is called.
    if (text === "" || text === "." || text === "..") throw new Error(`invalid path parameter "${name}" for ${template}`);
    return encodeURIComponent(text);
  });
}

/**
 * The API reports a refusal three ways (verified live 2026-10-15, FOLLOWUPS 24 "also found"):
 * a `message`; a per-field `errors` map on a 422, with no message at all
 * (`{ dueDate: ["The due date field is required when start date is present."] }`); and a 200
 * whose body says `success: false` with a `reason` (`"limit"` when the workspace's plan lacks
 * the feature). All three are errors to the caller, and this is the one place they are read.
 */
export function describeApiError(json: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof json.message === "string" && json.message !== "") parts.push(json.message);
  if (typeof json.errors === "object" && json.errors !== null) {
    for (const [field, reasons] of Object.entries(json.errors as Record<string, unknown>)) {
      parts.push(`${field}: ${Array.isArray(reasons) ? reasons.map(String).join(" ") : String(reasons)}`);
    }
  }
  if (typeof json.reason === "string" && json.reason !== "") parts.push(`WEEEK refused the request (reason: ${json.reason})`);
  return parts.length > 0 ? parts.join("; ") : "WEEEK API error";
}

export class HttpClient {
  constructor(private cfg: HttpConfig, private fetchImpl: typeof fetch = fetch) {}

  get origin(): string {
    return new URL(this.cfg.baseUrl).origin;
  }

  async execute<T>(operation: Operation, opts: ExecuteOptions = {}): Promise<T> {
    // Tools are listed without a token; the token is required only once a tool actually
    // calls the API. Fail clearly here instead of sending an unauthenticated request.
    if (!this.cfg.token) throw new WeeekAuthError();
    const url = new URL(this.cfg.baseUrl + fillPath(operation.path, opts.params));
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    // Multipart bodies must NOT get a JSON content-type — fetch sets the boundary itself.
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.token}` };
    if (!isForm) headers["content-type"] = "application/json";
    const res = await this.send(url, {
      method: operation.method,
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new WeeekApiError(describeApiError(json), res.status, `http_${res.status}`);
    // A 200 can still be a refusal: `success: false` with a `reason`, which the start-date smoke hit (FOLLOWUPS 21 b).
    if (json.success === false) throw new WeeekApiError(describeApiError(json), res.status, "refused");
    return json as T;
  }

  /**
   * Download a pre-signed URL. No credentials are sent — not to WEEEK, not to the storage
   * host it redirects to — and the redirect is followed by hand, once, only to https, so
   * where the bytes come from is decided here rather than by fetch's redirect policy.
   */
  async download(url: URL): Promise<BinaryResponse> {
    let res = await this.sendUnauthenticated(url);
    if (HttpClient.isRedirect(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`${url.host} redirected without a location`);
      const target = new URL(location, url);
      if (target.protocol !== "https:") throw new Error(`refusing a redirect to non-https ${target.origin}`);
      res = await this.sendUnauthenticated(target);
      if (HttpClient.isRedirect(res.status)) throw new Error(`${target.host} answered with another redirect; only one is followed`);
    }
    if (!res.ok) throw new WeeekApiError("download failed", res.status, `http_${res.status}`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  private static isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  // "fetch failed" alone has cost real debugging time (a VPN routed the storage host into a
  // black hole), so a transport failure names the host and undici's cause code.
  private async sendUnauthenticated(url: URL): Promise<Response> {
    try {
      return await this.send(url, { method: "GET", redirect: "manual" });
    } catch (err) {
      if (err instanceof WeeekTimeoutError) throw err;
      const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err instanceof Error ? err.message : String(err));
      throw new Error(`could not reach ${url.host} (${cause}); if you are on a VPN, the storage host may be routed through it`);
    }
  }

  private async send(url: URL, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: ctrl.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new WeeekTimeoutError();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
