import { describe, it, expect, vi } from "vitest";
import { WeeekClient } from "../src/client.js";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
}
const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000 };

describe("WeeekClient", () => {
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
});
