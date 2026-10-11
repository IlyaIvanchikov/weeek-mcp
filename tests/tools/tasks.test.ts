import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools, MAX_AUTO_PAGES } from "../../src/tools/tasks.js";
import { errorReply } from "../../src/tools/reply.js";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";

// fs is mocked here so attach wiring can be exercised without touching disk;
// the REAL path-jail exploit tests live in tests/attach.test.ts (unmocked fs).
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  realpath: vi.fn(async (p: string) => String(p)),
  stat: vi.fn(async () => ({ isFile: () => true, size: 3 })),
}));

const DEFAULT_ATTACH = { attachDir: "/allowed", maxBytes: 1000 };

// The real MCP server parses raw tool-call args against the tool's zod schema shape
// (via z.object(shape).parse(rawArgs)) before invoking the handler. The mocked
// `server.registerTool` below replays that same parse step so these tests exercise
// real zod behavior (including `.default(...)` application) instead of just calling the
// handler with whatever raw object the test passes.
function harness(clientOver: Record<string, any>, attachPolicy = DEFAULT_ATTACH, readPolicy = { maxBytes: 1024 }) {
  const client = clientOver as any;
  const cache = new NameCache(100000, () => 0);
  const resolver = new Resolver(client, cache);
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, Function>();
  vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
    const schema = z.object(config?.inputSchema ?? {});
    handlers.set(name, (rawArgs: unknown) => cb(schema.parse(rawArgs)));
    return undefined as any;
  }) as any);
  registerTaskTools({ server, client, resolver, cache, attachPolicy, readPolicy });
  return handlers;
}

const baseClient = {
  projects: { list: async () => [{ id: 1, name: "Marketing" }] },
  boards: { list: async () => [{ id: 10, name: "Main" }] },
  columns: { list: async () => [{ id: 100, name: "In Progress" }] },
  workspace: { listMembers: async () => [{ id: "u1", name: "Ilya" }] },
};

describe("task tools", () => {
  it("create_task resolves names to ids before creating", async () => {
    const createTask = vi.fn(async (b: any) => ({ id: 5, ...b }));
    const h = harness({ ...baseClient, tasks: { create: createTask } });
    const res = await h.get("weeek_create_task")!({
      title: "Ship it", project: "Marketing", column: "In Progress", assignee: "Ilya",
    });
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Ship it", projectId: 1, boardColumnId: 100, userId: "u1",
    }));
    expect(JSON.parse(res.content[0].text).id).toBe(5);
  });

  it("create_task surfaces a ResolutionError with candidates", async () => {
    const h = harness({ ...baseClient, tasks: { create: vi.fn() } });
    const res = await h.get("weeek_create_task")!({ title: "x", project: "Markting" });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toHaveProperty("candidates");
  });

  it("create_tasks reports per-item ok/error and does not abort on one bad name", async () => {
    const createTask = vi.fn(async (b: any) => ({ id: 9, ...b }));
    const h = harness({ ...baseClient, tasks: { create: createTask } });
    const res = await h.get("weeek_create_tasks")!({
      tasks: [
        { title: "good", project: "Marketing" },
        { title: "bad", project: "Nope" },
      ],
    });
    const report = JSON.parse(res.content[0].text);
    expect(report[0].ok).toBe(true);
    expect(report[1].ok).toBe(false);
    expect(report[1].error).toMatch(/resolve/i);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("create_tasks surfaces candidates on a failed item without aborting the batch", async () => {
    const createTask = vi.fn(async (b: any) => ({ id: 9, ...b }));
    const h = harness({ ...baseClient, tasks: { create: createTask } });
    const res = await h.get("weeek_create_tasks")!({
      tasks: [
        { title: "good", project: "Marketing" },
        { title: "bad", project: "Mark" }, // partial match -> ResolutionError with candidates
      ],
    });
    const report = JSON.parse(res.content[0].text);
    expect(report[0]).toEqual({ ok: true, task: expect.objectContaining({ id: 9 }) });
    expect(report[1].ok).toBe(false);
    expect(report[1]).toHaveProperty("candidates");
    expect(report[1].candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1, name: "Marketing" })]),
    );
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("update_task never sends description (WEEEK ignores it) even if a caller passes one", async () => {
    const updateTask = vi.fn(async (id: number, patch: any) => ({ id, ...patch }));
    const h = harness({ ...baseClient, tasks: { update: updateTask } });
    await h.get("weeek_update_task")!({ id: 3, title: "New", description: "should be dropped" });
    expect(updateTask).toHaveBeenCalledWith(3, { title: "New" });
    expect(updateTask.mock.calls[0][1]).not.toHaveProperty("description");
  });

  it("delete_task requires confirm:true — a bare {id} is rejected before any client call", () => {
    const deleteTask = vi.fn(async (_id: number) => ({ success: true }));
    const h = harness({ ...baseClient, tasks: { remove: deleteTask } });
    expect(() => h.get("weeek_delete_task")!({ id: 42 })).toThrow();
    expect(() => h.get("weeek_delete_task")!({ id: 42, confirm: false })).toThrow();
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("delete_task deletes only when confirm:true is passed", async () => {
    const deleteTask = vi.fn(async (_id: number) => ({ success: true }));
    const h = harness({ ...baseClient, tasks: { remove: deleteTask } });
    const res = await h.get("weeek_delete_task")!({ id: 42, confirm: true });
    expect(deleteTask).toHaveBeenCalledWith(42);
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });

  it("attach_file refuses a path outside the allowed dir (no client call)", async () => {
    const attachFile = vi.fn();
    const h = harness({ ...baseClient, tasks: { uploadAttachment: attachFile } }); // jailed to /allowed
    const res = await h.get("weeek_attach_file")!({ task_id: 70, path: "/etc/passwd" });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toMatch(/outside/i);
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("attach_file uploads a file inside the allowed dir under its basename", async () => {
    const attachFile = vi.fn(async (_opts: { id: number; filename: string; data: unknown }) => [{ id: "a1", name: "ok.txt", url: "http://x", size: 3 }]);
    const h = harness({ ...baseClient, tasks: { uploadAttachment: attachFile } }); // jailed to /allowed
    const res = await h.get("weeek_attach_file")!({ task_id: 70, path: "ok.txt" });
    expect(attachFile).toHaveBeenCalledWith({ id: 70, filename: "ok.txt", data: expect.anything() });
    expect(JSON.parse(res.content[0].text)[0].id).toBe("a1");
  });

  it("complete_task calls setCompleted", async () => {
    const setCompleted = vi.fn(async ({ id, completed }: { id: number; completed: boolean }) => ({ id, completed }));
    const h = harness({ ...baseClient, tasks: { setCompleted } });
    await h.get("weeek_complete_task")!({ id: 3, completed: true });
    expect(setCompleted).toHaveBeenCalledWith({ id: 3, completed: true });
  });

  it("move_task resolves the column scoped to board_id (no project field) and moves the task", async () => {
    const listColumns = vi.fn(async (_bid: number) => [
      { id: 100, name: "In Progress" },
      { id: 101, name: "Done" },
    ]);
    const moveTask = vi.fn(async ({ id, boardColumnId }: { id: number; boardId: number; boardColumnId: number }) => ({
      id, boardColumnId, projectId: 1, title: "t", description: null, completed: false,
    }));
    const h = harness({ ...baseClient, columns: { list: listColumns }, tasks: { move: moveTask } });
    const res = await h.get("weeek_move_task")!({ id: 7, board_id: 20, column: "done" });
    expect(listColumns).toHaveBeenCalledWith(20);
    expect(moveTask).toHaveBeenCalledWith({ id: 7, boardId: 20, boardColumnId: 101 });
    expect(JSON.parse(res.content[0].text).id).toBe(7);
  });

  it("weeek_get_task returns the task as JSON text", async () => {
    const h = harness({ tasks: { get: async (id: number) => ({ id, title: "T" }) } });
    const res = await h.get("weeek_get_task")!({ id: 7 });
    expect(JSON.parse(res.content[0].text)).toEqual({ id: 7, title: "T" });
  });

  it("weeek_list_projects returns the list", async () => {
    const h = harness({ projects: { list: async () => [{ id: 1, name: "Marketing" }] } });
    const res = await h.get("weeek_list_projects")!({});
    expect(JSON.parse(res.content[0].text)).toEqual([{ id: 1, name: "Marketing" }]);
  });

  it("weeek_list_members returns the members list", async () => {
    const h = harness({ workspace: { listMembers: async () => [{ id: "u1", name: "Ilya" }] } });
    const res = await h.get("weeek_list_members")!({});
    expect(JSON.parse(res.content[0].text)).toEqual([{ id: "u1", name: "Ilya" }]);
  });

  it("weeek_list_tasks with no args applies the default perPage/offset", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ tasks: { list: listTasks } });
    await h.get("weeek_list_tasks")!({});
    expect(listTasks.mock.calls[0][0]).toMatchObject({ perPage: 20, offset: 0 });
  });

  it("weeek_list_tasks with a projectId filter still applies the default perPage", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ tasks: { list: listTasks } });
    await h.get("weeek_list_tasks")!({ projectId: 5 });
    expect(listTasks.mock.calls[0][0]).toMatchObject({ projectId: 5, perPage: 20 });
  });

  it("weeek_list_tasks forwards server-side user, status, and date filters", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ tasks: { list: listTasks } });
    await h.get("weeek_list_tasks")!({
      userId: "a1f0e7c1-f041-4128-a179-5baad1783524",
      completed: false,
      startDate: "21.07.2026",
      endDate: "26.07.2026",
      limit: 50,
    });
    expect(listTasks.mock.calls[0][0]).toMatchObject({
      userId: "a1f0e7c1-f041-4128-a179-5baad1783524",
      completed: 0,
      startDate: "21.07.2026",
      endDate: "26.07.2026",
      perPage: 50,
      offset: 0,
    });
  });

  it("weeek_list_tasks can collect every server-filtered page inside the connector", async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
    const secondPage = [{ id: 51 }];
    const listTasks = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const h = harness({ tasks: { list: listTasks } });
    const res = await h.get("weeek_list_tasks")!({
      userId: "a1f0e7c1-f041-4128-a179-5baad1783524",
      completed: false,
      startDate: "01.01.2000",
      endDate: "26.07.2026",
      limit: 50,
      allPages: true,
    });
    expect(JSON.parse(res.content[0].text)).toHaveLength(51);
    expect(listTasks).toHaveBeenNthCalledWith(1, expect.objectContaining({ perPage: 50, offset: 0 }));
    expect(listTasks).toHaveBeenNthCalledWith(2, expect.objectContaining({ perPage: 50, offset: 50 }));
  });

  it("weeek_list_tasks caps auto-pagination instead of looping forever on always-full pages", async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
    const listTasks = vi.fn(async () => fullPage); // never shorter than perPage → never self-terminates
    const h = harness({ tasks: { list: listTasks } });
    const res = await h.get("weeek_list_tasks")!({
      userId: "a1f0e7c1-f041-4128-a179-5baad1783524",
      completed: false,
      startDate: "01.01.2000",
      endDate: "26.07.2026",
      limit: 50,
      allPages: true,
    });
    expect(res.isError).toBe(true);
    expect(listTasks).toHaveBeenCalledTimes(MAX_AUTO_PAGES);
  });

  it("weeek_list_tasks refuses unfiltered automatic pagination", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ tasks: { list: listTasks } });
    const res = await h.get("weeek_list_tasks")!({ allPages: true });
    expect(res.isError).toBe(true);
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("weeek_list_tasks requires date filters as a pair", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ tasks: { list: listTasks } });
    const res = await h.get("weeek_list_tasks")!({ startDate: "21.07.2026" });
    expect(res.isError).toBe(true);
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("weeek_get_task returns an error reply when the client rejects", async () => {
    const h = harness({
      tasks: {
        get: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
    });
    const res = await h.get("weeek_get_task")!({ id: 7 });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toBeDefined();
  });

  it("errorReply surfaces candidates for a ResolutionError", () => {
    const res = errorReply({
      name: "ResolutionError",
      message: "x",
      candidates: [{ id: 1, name: "A" }],
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).candidates).toEqual([{ id: 1, name: "A" }]);
  });
  it("weeek_get_attachment returns an image block for a weeek-hosted image", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const attachment = {
      id: "a1", creatorId: "u1", service: "weeek", name: "modules.png",
      url: "https://api.weeek.net/f/a1", size: png.length, createdAt: "2026-08-01T10:00:00Z",
    };
    const h = harness({
      attachments: {
        get: async () => attachment,
        download: async () => ({ bytes: png, contentType: "image/png" }),
      },
    });
    const res = await h.get("weeek_get_attachment")!({ id: "a1" });
    expect(res.content[0]).toEqual({
      type: "image",
      data: Buffer.from(png).toString("base64"),
      mimeType: "image/png",
    });
  });

  it("weeek_get_attachment returns metadata only for a non-image attachment", async () => {
    const attachment = {
      id: "a2", creatorId: "u1", service: "weeek", name: "spec.pdf",
      url: "https://api.weeek.net/f/a2", size: 12, createdAt: "2026-08-01T10:00:00Z",
    };
    const download = vi.fn(async () => ({ bytes: new Uint8Array([1, 2]), contentType: "application/pdf" }));
    const h = harness({ attachments: { get: async () => attachment, download } });
    const res = await h.get("weeek_get_attachment")!({ id: "a2" });
    const body = JSON.parse(res.content[0].text);
    expect(body.attachment).toEqual(attachment);
    expect(body.note).toMatch(/not an image/i);
  });

  it("weeek_get_attachment does not download an externally stored attachment", async () => {
    const attachment = {
      id: "a3", creatorId: "u1", service: "google_drive", name: "x.png",
      url: "https://drive.google.com/file/a3", createdAt: "2026-08-01T10:00:00Z",
    };
    const download = vi.fn();
    const h = harness({ attachments: { get: async () => attachment, download } });
    const res = await h.get("weeek_get_attachment")!({ id: "a3" });
    const body = JSON.parse(res.content[0].text);
    expect(body.attachment).toEqual(attachment);
    expect(body.note).toMatch(/google_drive/);
    expect(download).not.toHaveBeenCalled();
  });

  it("weeek_get_attachment skips the download when metadataOnly is set", async () => {
    const attachment = {
      id: "a4", creatorId: "u1", service: "weeek", name: "modules.png",
      url: "https://api.weeek.net/f/a4", size: 4, createdAt: "2026-08-01T10:00:00Z",
    };
    const download = vi.fn();
    const h = harness({ attachments: { get: async () => attachment, download } });
    const res = await h.get("weeek_get_attachment")!({ id: "a4", metadataOnly: true });
    expect(JSON.parse(res.content[0].text).attachment).toEqual(attachment);
    expect(download).not.toHaveBeenCalled();
  });

  it("weeek_get_attachment passes the configured cap to the download", async () => {
    const attachment = {
      id: "a5", creatorId: "u1", service: "weeek", name: "modules.png",
      url: "https://api.weeek.net/f/a5", size: 4, createdAt: "2026-08-01T10:00:00Z",
    };
    const download = vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: "image/png" }));
    const h = harness({ attachments: { get: async () => attachment, download } }, DEFAULT_ATTACH, { maxBytes: 4096 });
    await h.get("weeek_get_attachment")!({ id: "a5" });
    expect(download).toHaveBeenCalledWith({ attachment, maxBytes: 4096 });
  });

  it("weeek_get_attachment surfaces a download refusal as an error reply", async () => {
    const attachment = {
      id: "a6", creatorId: "u1", service: "weeek", name: "big.png",
      url: "https://api.weeek.net/f/a6", size: 99999, createdAt: "2026-08-01T10:00:00Z",
    };
    const h = harness({
      attachments: {
        get: async () => attachment,
        download: async () => { throw new Error("attachment a6 is too large (99999 > 1024 bytes)"); },
      },
    });
    const res = await h.get("weeek_get_attachment")!({ id: "a6" });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toMatch(/too large/);
  });
});
