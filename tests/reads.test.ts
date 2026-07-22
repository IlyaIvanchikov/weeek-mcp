import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools, MAX_AUTO_PAGES } from "../src/tools/reads.js";
import { errorReply } from "../src/tools/reply.js";

// The real MCP server parses raw tool-call args against the tool's zod schema shape
// (via z.object(shape).parse(rawArgs)) before invoking the handler — that's where
// `.default(...)` fields get their default applied. The mocked `server.tool` below
// replays that same parse step so these tests exercise real zod default-application
// behavior instead of just calling the handler with whatever raw object the test passes.
function harness(clientOver: Record<string, any>) {
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, Function>();
  vi.spyOn(server, "registerTool").mockImplementation(((name: string, config: any, cb: Function) => {
    const schema = z.object(config?.inputSchema ?? {});
    handlers.set(name, (rawArgs: unknown) => cb(schema.parse(rawArgs)));
    return undefined as any;
  }) as any);
  registerReadTools(server, clientOver as any);
  return handlers;
}

describe("read tools", () => {
  it("weeek_get_task returns the task as JSON text", async () => {
    const h = harness({ getTask: async (id: number) => ({ id, title: "T" }) });
    const res = await h.get("weeek_get_task")!({ id: 7 });
    expect(JSON.parse(res.content[0].text)).toEqual({ id: 7, title: "T" });
  });

  it("weeek_version returns the package name and version", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const h = harness({});
    const res = await h.get("weeek_version")!({});
    expect(JSON.parse(res.content[0].text)).toEqual({ name: pkg.name, version: pkg.version });
  });

  it("weeek_list_projects returns the list", async () => {
    const h = harness({ listProjects: async () => [{ id: 1, name: "Marketing" }] });
    const res = await h.get("weeek_list_projects")!({});
    expect(JSON.parse(res.content[0].text)).toEqual([{ id: 1, name: "Marketing" }]);
  });

  it("weeek_list_members returns the members list", async () => {
    const h = harness({ listMembers: async () => [{ id: "u1", name: "Ilya" }] });
    const res = await h.get("weeek_list_members")!({});
    expect(JSON.parse(res.content[0].text)).toEqual([{ id: "u1", name: "Ilya" }]);
  });

  it("weeek_list_tasks with no args applies the default perPage/offset", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ listTasks });
    await h.get("weeek_list_tasks")!({});
    expect(listTasks.mock.calls[0][0]).toMatchObject({ perPage: 20, offset: 0 });
  });

  it("weeek_list_tasks with a projectId filter still applies the default perPage", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ listTasks });
    await h.get("weeek_list_tasks")!({ projectId: 5 });
    expect(listTasks.mock.calls[0][0]).toMatchObject({ projectId: 5, perPage: 20 });
  });

  it("weeek_list_tasks forwards server-side user, status, and date filters", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ listTasks });
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
    const h = harness({ listTasks });
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
    const h = harness({ listTasks });
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
    const h = harness({ listTasks });
    const res = await h.get("weeek_list_tasks")!({ allPages: true });
    expect(res.isError).toBe(true);
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("weeek_list_tasks requires date filters as a pair", async () => {
    const listTasks = vi.fn(async () => []);
    const h = harness({ listTasks });
    const res = await h.get("weeek_list_tasks")!({ startDate: "21.07.2026" });
    expect(res.isError).toBe(true);
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("weeek_get_task returns an error reply when the client rejects", async () => {
    const h = harness({
      getTask: vi.fn(async () => {
        throw new Error("boom");
      }),
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
});
