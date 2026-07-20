import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWriteTools } from "../src/tools/writes.js";
import { Resolver } from "../src/resolver.js";
import { NameCache } from "../src/cache.js";

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
// real zod behavior instead of just calling the handler with whatever raw object the
// test passes (see tests/reads.test.ts for the same pattern).
function harness(clientOver: Record<string, any>, attachPolicy: { attachDir: string; maxBytes: number } = DEFAULT_ATTACH) {
  const client = clientOver as any;
  const resolver = new Resolver(client, new NameCache(100000, () => 0));
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, Function>();
  vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
    const schema = z.object(config?.inputSchema ?? {});
    handlers.set(name, (rawArgs: unknown) => cb(schema.parse(rawArgs)));
    return undefined as any;
  }) as any);
  registerWriteTools(server, client, resolver, attachPolicy);
  return handlers;
}

const baseClient = {
  listProjects: async () => [{ id: 1, name: "Marketing" }],
  listBoards: async () => [{ id: 10, name: "Main" }],
  listColumns: async () => [{ id: 100, name: "In Progress" }],
  listMembers: async () => [{ id: "u1", name: "Ilya" }],
};

describe("write tools", () => {
  it("create_task resolves names to ids before creating", async () => {
    const createTask = vi.fn(async (b: any) => ({ id: 5, ...b }));
    const h = harness({ ...baseClient, createTask });
    const res = await h.get("weeek_create_task")!({
      title: "Ship it", project: "Marketing", column: "In Progress", assignee: "Ilya",
    });
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Ship it", projectId: 1, boardColumnId: 100, userId: "u1",
    }));
    expect(JSON.parse(res.content[0].text).id).toBe(5);
  });

  it("create_task surfaces a ResolutionError with candidates", async () => {
    const h = harness({ ...baseClient, createTask: vi.fn() });
    const res = await h.get("weeek_create_task")!({ title: "x", project: "Markting" });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toHaveProperty("candidates");
  });

  it("create_tasks reports per-item ok/error and does not abort on one bad name", async () => {
    const createTask = vi.fn(async (b: any) => ({ id: 9, ...b }));
    const h = harness({ ...baseClient, createTask });
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
    const h = harness({ ...baseClient, createTask });
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
    const h = harness({ ...baseClient, updateTask });
    await h.get("weeek_update_task")!({ id: 3, title: "New", description: "should be dropped" });
    expect(updateTask).toHaveBeenCalledWith(3, { title: "New" });
    expect(updateTask.mock.calls[0][1]).not.toHaveProperty("description");
  });

  it("delete_task requires confirm:true — a bare {id} is rejected before any client call", () => {
    const deleteTask = vi.fn(async (_id: number) => ({ success: true }));
    const h = harness({ ...baseClient, deleteTask });
    expect(() => h.get("weeek_delete_task")!({ id: 42 })).toThrow();
    expect(() => h.get("weeek_delete_task")!({ id: 42, confirm: false })).toThrow();
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("delete_task deletes only when confirm:true is passed", async () => {
    const deleteTask = vi.fn(async (_id: number) => ({ success: true }));
    const h = harness({ ...baseClient, deleteTask });
    const res = await h.get("weeek_delete_task")!({ id: 42, confirm: true });
    expect(deleteTask).toHaveBeenCalledWith(42);
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });

  it("attach_file refuses a path outside the allowed dir (no client call)", async () => {
    const attachFile = vi.fn();
    const h = harness({ ...baseClient, attachFile }); // jailed to /allowed
    const res = await h.get("weeek_attach_file")!({ task_id: 70, path: "/etc/passwd" });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toMatch(/outside/i);
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("attach_file uploads a file inside the allowed dir under its basename", async () => {
    const attachFile = vi.fn(async () => [{ id: "a1", name: "ok.txt", url: "http://x", size: 3 }]);
    const h = harness({ ...baseClient, attachFile }); // jailed to /allowed
    const res = await h.get("weeek_attach_file")!({ task_id: 70, path: "ok.txt" });
    expect(attachFile).toHaveBeenCalledWith(70, "ok.txt", expect.anything());
    expect(JSON.parse(res.content[0].text)[0].id).toBe("a1");
  });

  it("complete_task calls setCompleted", async () => {
    const setCompleted = vi.fn(async (id: number, c: boolean) => ({ id, completed: c }));
    const h = harness({ ...baseClient, setCompleted });
    await h.get("weeek_complete_task")!({ id: 3, completed: true });
    expect(setCompleted).toHaveBeenCalledWith(3, true);
  });

  it("move_task resolves the column scoped to board_id (no project field) and moves the task", async () => {
    const listColumns = vi.fn(async (_bid: number) => [
      { id: 100, name: "In Progress" },
      { id: 101, name: "Done" },
    ]);
    const moveTask = vi.fn(async (id: number, boardId: number, boardColumnId: number) => ({
      id, boardColumnId, projectId: 1, title: "t", description: null, completed: false,
    }));
    const h = harness({ ...baseClient, listColumns, moveTask });
    const res = await h.get("weeek_move_task")!({ id: 7, board_id: 20, column: "done" });
    expect(listColumns).toHaveBeenCalledWith(20);
    expect(moveTask).toHaveBeenCalledWith(7, 20, 101);
    expect(JSON.parse(res.content[0].text).id).toBe(7);
  });
});
