import { describe, it, expect, vi } from "vitest";
import { WeeekClient } from "../src/client.js";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
}
function fakeBinaryFetch(status: number, bytes: Uint8Array, contentType: string) {
  return vi.fn(async () => new Response(bytes as unknown as BodyInit, {
    status, headers: { "content-type": contentType },
  }));
}
function redirectThenBinaryFetch(location: string, bytes: Uint8Array, contentType: string, secondStatus = 200) {
  return vi.fn()
    .mockImplementationOnce(async () => new Response(null, { status: 303, headers: { location } }))
    .mockImplementationOnce(async () => new Response(bytes as unknown as BodyInit, { status: secondStatus, headers: { "content-type": contentType } }));
}
const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000 };

describe("WeeekClient", () => {
  it("throws a clear error when no token is set, without calling fetch", async () => {
    const f = fakeFetch(200, {});
    const c = new WeeekClient({ ...cfg, token: undefined }, f as unknown as typeof fetch);
    await expect(c.listProjects()).rejects.toThrow(/WEEEK_API_TOKEN/);
    expect(f).not.toHaveBeenCalled();
  });

  it("listProjects normalises to {id,name}", async () => {
    const f = fakeFetch(200, { success: true, projects: [{ id: 1, name: "Marketing" }] });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect(await c.listProjects()).toEqual([{ id: 1, name: "Marketing" }]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/projects");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer " + "t".repeat(24) });
  });

  it("listMembers joins first + last name", async () => {
    const f = fakeFetch(200, { success: true, members: [{ id: 9, firstName: "Ilya", lastName: "I" }] });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect(await c.listMembers()).toEqual([{ id: "9", name: "Ilya I" }]);
  });

  it("createTask posts locations + returns the task", async () => {
    const f = fakeFetch(200, { success: true, task: { id: 5, title: "T", description: null, projectId: 1, boardColumnId: 2, completed: false } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const t = await c.createTask({ title: "T", projectId: 1, boardColumnId: 2 });
    expect(t.id).toBe(5);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      title: "T", locations: [{ projectId: 1, boardColumnId: 2 }],
    });
  });

  it("getTask surfaces assignees, boardId, and dueDate", async () => {
    const f = fakeFetch(200, { success: true, task: {
      id: 78, title: "T", description: null, projectId: 2,
      boardId: 3, boardColumnId: 8, assignees: ["a2318d51-uuid"],
      dueDate: "2026-07-22", isCompleted: false,
    } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const t = await c.getTask(78);
    expect(t.assignees).toEqual(["a2318d51-uuid"]);
    expect(t.boardId).toBe(3);
    expect(t.dueDate).toBe("2026-07-22");
  });

  it("getTask defaults assignees to [] when the field is absent", async () => {
    const f = fakeFetch(200, { success: true, task: { id: 1, title: "T", projectId: 2, boardColumnId: 8 } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const t = await c.getTask(1);
    expect(t.assignees).toEqual([]);
    expect(t.boardId).toBeNull();
  });

  it("throws WeeekApiError on non-2xx", async () => {
    const f = fakeFetch(404, { success: false, message: "nope" });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    await expect(c.getTask(1)).rejects.toMatchObject({ name: "WeeekApiError", status: 404 });
  });

  it("setCompleted(id, true) posts to /complete", async () => {
    const f = fakeFetch(200, { success: true, task: { id: 7, title: "T", description: null, projectId: 1, boardColumnId: 2, completed: true } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const t = await c.setCompleted(7, true);
    expect(t.completed).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks/7/complete");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("setCompleted(id, false) posts to /un-complete (regression lock)", async () => {
    const f = fakeFetch(200, { success: true, task: { id: 7, title: "T", description: null, projectId: 1, boardColumnId: 2, completed: false } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const t = await c.setCompleted(7, false);
    expect(t.completed).toBe(false);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks/7/un-complete");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("deleteTask sends DELETE to /tm/tasks/{id}", async () => {
    const f = fakeFetch(200, { success: true });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect(await c.deleteTask(9)).toEqual({ success: true });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks/9");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("attachFile posts multipart files[] to /attachments and returns the data array", async () => {
    const att = { id: "a1", name: "f.md", url: "http://x", size: 3 };
    const f = fakeFetch(200, { success: true, data: [att] });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const out = await c.attachFile(7, "f.md", new Uint8Array([1, 2, 3]));
    expect(out).toEqual([att]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.weeek.net/public/v1/tm/tasks/7/attachments");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    // multipart must NOT carry a JSON content-type (fetch sets the boundary itself)
    expect((init as RequestInit).headers).not.toHaveProperty("content-type");
    const file = (init as RequestInit).body as FormData;
    expect((file.get("files[]") as File).name).toBe("f.md");
  });

  it("moveTask posts board then board-column, then fetches the task", async () => {
    const f = fakeFetch(200, { success: true, task: { id: 7, title: "T", description: null, projectId: 1, boardColumnId: 4, completed: false } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const t = await c.moveTask(7, 3, 4);
    expect(t.id).toBe(7);
    expect(f.mock.calls.length).toBe(3);
    const [boardUrl, boardInit] = f.mock.calls[0];
    expect(String(boardUrl)).toBe("https://api.weeek.net/public/v1/tm/tasks/7/board");
    expect((boardInit as RequestInit).method).toBe("POST");
    expect(JSON.parse((boardInit as RequestInit).body as string)).toEqual({ boardId: 3 });
    const [columnUrl, columnInit] = f.mock.calls[1];
    expect(String(columnUrl)).toBe("https://api.weeek.net/public/v1/tm/tasks/7/board-column");
    expect((columnInit as RequestInit).method).toBe("POST");
    expect(JSON.parse((columnInit as RequestInit).body as string)).toEqual({ boardColumnId: 4 });
  });
  it("getAttachment GETs /ws/attachments/{id} and returns the metadata from the data envelope", async () => {
    const att = {
      id: "a285d36a-8019-41e9-9e58-ad29213bce35",
      creatorId: "a2318d51-46cd-42a9-bab4-554c80824574",
      service: "weeek",
      name: "modules.png",
      url: "https://api.weeek.net/ws/1005494/files/a285d36a-8019-41e9-9e58-ad29213bce35?sig=x",
      size: 4096,
      createdAt: "2026-08-01T10:00:00Z",
    };
    const f = fakeFetch(200, { success: true, data: att });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect(await c.getAttachment(att.id)).toEqual(att);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(`https://api.weeek.net/public/v1/ws/attachments/${att.id}`);
    expect((init as RequestInit).method).toBe("GET");
  });

  it("getTask surfaces the attachments the API already returns", async () => {
    const att = {
      id: "a285d36a-8019-41e9-9e58-ad29213bce35", creatorId: "u1", service: "weeek",
      name: "modules.png", url: "https://api.weeek.net/f/1", size: 10, createdAt: "2026-08-01T10:00:00Z",
    };
    const f = fakeFetch(200, { success: true, task: { id: 131, title: "T", attachments: [att] } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect((await c.getTask(131)).attachments).toEqual([att]);
  });

  it("getTask defaults attachments to [] when the field is absent", async () => {
    const f = fakeFetch(200, { success: true, task: { id: 1, title: "T" } });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect((await c.getTask(1)).attachments).toEqual([]);
  });

  it("attachFile accepts the documented single-object data shape", async () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "f.md", url: "http://x", size: 3, createdAt: "2026-08-01T10:00:00Z" };
    const f = fakeFetch(200, { success: true, data: att });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    expect(await c.attachFile(7, "f.md", new Uint8Array([1, 2, 3]))).toEqual([att]);
  });

  it("downloadAttachment fetches the attachment url and returns its bytes and content-type", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const f = fakeBinaryFetch(200, png, "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "modules.png",
      url: "https://api.weeek.net/ws/1005494/files/a1?sig=x", size: png.length,
      createdAt: "2026-08-01T10:00:00Z",
    };
    const out = await c.downloadAttachment({ attachment, maxBytes: 1024 });
    expect(out.contentType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(attachment.url);
    // The url is pre-signed (expires + signature), so the token is never part of a download.
    expect((init as RequestInit).headers ?? {}).not.toHaveProperty("Authorization");
    expect((init as RequestInit).redirect).toBe("manual");
  });

  it("downloadAttachment follows one redirect from the API origin to the storage host, without the token", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const storage = "https://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1?X-Amz-Signature=s";
    const f = redirectThenBinaryFetch(storage, png, "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "modules.png",
      url: "https://api.weeek.net/ws/1005494/files/a1?expires=1&signature=x", size: png.length,
      createdAt: "2026-08-01T10:00:00Z",
    };
    const out = await c.downloadAttachment({ attachment, maxBytes: 1024 });
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1][0])).toBe(storage);
    expect((f.mock.calls[1][1] as RequestInit).headers ?? {}).not.toHaveProperty("Authorization");
  });

  it("downloadAttachment refuses a redirect to a non-https location", async () => {
    const f = redirectThenBinaryFetch("http://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1", new Uint8Array([1]), "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "x.png",
      url: "https://api.weeek.net/ws/1005494/files/a1?expires=1&signature=x", size: 1, createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/https/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("downloadAttachment refuses a second redirect", async () => {
    const f = redirectThenBinaryFetch("https://storage.example/one", new Uint8Array([1]), "image/png", 302);
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "x.png",
      url: "https://api.weeek.net/ws/1005494/files/a1?expires=1&signature=x", size: 1, createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/redirect/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("downloadAttachment names the unreachable host and the cause when the transport fails", async () => {
    const f = vi.fn()
      .mockImplementationOnce(async () => new Response(null, { status: 303, headers: { location: "https://prod-private.s3.ru-1.storage.selcloud.ru/1005494/a1?X-Amz-Signature=s" } }))
      .mockImplementationOnce(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }); });
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "x.png",
      url: "https://api.weeek.net/ws/1005494/files/a1?expires=1&signature=x", size: 1, createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/prod-private\.s3\.ru-1\.storage\.selcloud\.ru.*UND_ERR_CONNECT_TIMEOUT.*VPN/s);
  });

  it("downloadAttachment refuses an attachment stored in an external service", async () => {
    const f = fakeBinaryFetch(200, new Uint8Array([1]), "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "google_drive" as const, name: "x.png",
      url: "https://drive.google.com/file/a1", createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/google_drive/);
    expect(f).not.toHaveBeenCalled();
  });

  it("downloadAttachment refuses a url outside the API origin", async () => {
    const f = fakeBinaryFetch(200, new Uint8Array([1]), "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "x.png",
      url: "https://evil.example.com/steal", size: 1, createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/origin/);
    expect(f).not.toHaveBeenCalled();
  });

  it("downloadAttachment refuses a declared size over maxBytes without fetching", async () => {
    const f = fakeBinaryFetch(200, new Uint8Array([1]), "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "big.png",
      url: "https://api.weeek.net/f/a1", size: 5000, createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/too large/);
    expect(f).not.toHaveBeenCalled();
  });

  it("downloadAttachment refuses a body over maxBytes even when size was absent", async () => {
    const f = fakeBinaryFetch(200, new Uint8Array(2048), "image/png");
    const c = new WeeekClient(cfg, f as unknown as typeof fetch);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek" as const, name: "big.png",
      url: "https://api.weeek.net/f/a1", createdAt: "2026-08-01T10:00:00Z",
    };
    await expect(c.downloadAttachment({ attachment, maxBytes: 1024 })).rejects.toThrow(/too large/);
    expect(f).toHaveBeenCalled();
  });
});
