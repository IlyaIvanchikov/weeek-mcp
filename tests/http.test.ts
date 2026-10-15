import { describe, it, expect, vi } from "vitest";
import { HttpClient, fillPath } from "../src/http.js";
import { httpConfig as cfg, bearer, jsonFetch, binaryFetch } from "./helpers/http.js";

const auth = { Authorization: bearer };
const op = { method: "GET", path: "/tm/tasks/{taskId}" } as const;

describe("fillPath", () => {
  it("substitutes and URL-encodes every parameter", () => {
    expect(fillPath("/tm/tasks/{taskId}/comments/{commentId}", { taskId: 7, commentId: "a b/c" })).toBe("/tm/tasks/7/comments/a%20b%2Fc");
  });
  it("encodes non-ASCII so a resolved name can never break the path", () => {
    expect(fillPath("/x/{name}", { name: "Маркетинг" })).toBe("/x/%D0%9C%D0%B0%D1%80%D0%BA%D0%B5%D1%82%D0%B8%D0%BD%D0%B3");
  });
  it("throws when a parameter is missing instead of sending a literal {taskId}", () => {
    expect(() => fillPath("/tm/tasks/{taskId}", {})).toThrow(/missing path parameter "taskId"/);
  });
  it.each(["", ".", ".."])("rejects %j, which the URL parser would turn into another endpoint", (value) => {
    expect(() => fillPath("/tm/tasks/{taskId}", { taskId: value })).toThrow(/invalid path parameter "taskId"/);
  });
});

describe("HttpClient.execute", () => {
  it("builds the URL from base + filled path + query, sends the bearer and a JSON content-type", async () => {
    const f = jsonFetch(200, { success: true, task: { id: 7 } });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    const out = await http.execute<{ task: { id: number } }>(op, { params: { taskId: 7 }, query: { perPage: 20, skip: undefined, completed: false } });
    expect(out.task.id).toBe(7);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks/7?perPage=20&completed=false");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).headers).toMatchObject({ ...auth, "content-type": "application/json" });
  });

  it("serialises an object body as JSON", async () => {
    const f = jsonFetch(200, { success: true });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await http.execute({ method: "POST", path: "/tm/tasks" }, { body: { title: "T" } });
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ title: "T" });
  });

  it("sends FormData as-is, without a JSON content-type", async () => {
    const f = jsonFetch(200, { success: true });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    const form = new FormData();
    form.append("files[]", new Blob([new Uint8Array([1])]), "f.bin");
    await http.execute({ method: "POST", path: "/tm/tasks/{taskId}/attachments" }, { params: { taskId: 1 }, body: form });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty("content-type");
  });

  it("throws WeeekAuthError without calling fetch when there is no token", async () => {
    const f = jsonFetch(200, {});
    const http = new HttpClient({ ...cfg, token: undefined }, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekAuthError" });
    expect(f).not.toHaveBeenCalled();
  });

  it("maps a non-2xx to WeeekApiError with the status and the API message", async () => {
    const f = jsonFetch(404, { success: false, message: "nope" });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekApiError", status: 404, message: "nope" });
  });

  it("names the field errors of a 422 instead of a bare 'WEEEK API error'", async () => {
    const f = jsonFetch(422, { success: false, errors: { dueDate: ["The due date field is required when start date is present."], day: ["The day field prohibits start date."] } });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({
      name: "WeeekApiError", status: 422,
      message: "dueDate: The due date field is required when start date is present.; day: The day field prohibits start date.",
    });
  });

  it("keeps the API message and appends the field errors when both come", async () => {
    const f = jsonFetch(422, { success: false, message: "The given data was invalid.", errors: { day: ["The day does not match the format d.m.Y."] } });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ message: "The given data was invalid.; day: The day does not match the format d.m.Y." });
  });

  it("throws on a 200 whose body says success:false, naming the reason", async () => {
    const f = jsonFetch(200, { success: false, reason: "limit" });
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekApiError", status: 200, code: "refused", message: "WEEEK refused the request (reason: limit)" });
  });

  it("passes a 2xx without a success flag through — a 204-style empty body", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    expect(await http.execute(op, { params: { taskId: 1 } })).toEqual({});
  });

  it("falls back to the generic message when the error body is not JSON", async () => {
    const f = vi.fn(async () => new Response("<html>Server Error</html>", { status: 500, headers: { "content-type": "text/html" } }));
    const http = new HttpClient(cfg, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekApiError", status: 500, message: "WEEEK API error" });
  });

  it("maps an aborted request to WeeekTimeoutError", async () => {
    const f = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const http = new HttpClient({ ...cfg, timeoutMs: 5 }, f as unknown as typeof fetch);
    await expect(http.execute(op, { params: { taskId: 1 } })).rejects.toMatchObject({ name: "WeeekTimeoutError" });
  });
});

describe("HttpClient.download", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const storage = "https://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1?X-Amz-Signature=s";
  function redirectThen(location: string, status = 200) {
    return vi.fn()
      .mockImplementationOnce(async () => new Response(null, { status: 303, headers: { location } }))
      .mockImplementationOnce(async () => new Response(png as unknown as BodyInit, { status, headers: { "content-type": "image/png" } }));
  }

  it("downloads a directly served file with no credentials and no automatic redirect", async () => {
    const f = binaryFetch(200, png, "image/png");
    const out = await new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/ws/1/files/a?expires=1&signature=x"));
    expect(out.contentType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.headers ?? {}).not.toHaveProperty("Authorization");
    expect(init.redirect).toBe("manual");
  });

  it("follows exactly one redirect to an https host, still without credentials", async () => {
    const f = redirectThen(storage);
    const out = await new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/ws/1/files/a?expires=1&signature=x"));
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1][0])).toBe(storage);
    expect((f.mock.calls[1][1] as RequestInit).headers ?? {}).not.toHaveProperty("Authorization");
  });

  it("refuses a redirect to a non-https location", async () => {
    const f = redirectThen("http://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1");
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a"))).rejects.toThrow(/https/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refuses a second redirect", async () => {
    const f = redirectThen("https://storage.example/one", 302);
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a"))).rejects.toThrow(/redirect/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("names the unreachable host and undici's cause code when the transport fails", async () => {
    const f = vi.fn()
      .mockImplementationOnce(async () => new Response(null, { status: 303, headers: { location: storage } }))
      .mockImplementationOnce(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }); });
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a")))
      .rejects.toThrow(/prod-private\.s3\.ru-1\.storage\.selcloud\.ru.*UND_ERR_CONNECT_TIMEOUT.*VPN/s);
  });

  it("maps a non-2xx download to WeeekApiError", async () => {
    const f = binaryFetch(403, new Uint8Array(), "text/plain");
    await expect(new HttpClient(cfg, f as unknown as typeof fetch).download(new URL("https://api.weeek.net/f/a"))).rejects.toMatchObject({ name: "WeeekApiError", status: 403 });
  });
});
