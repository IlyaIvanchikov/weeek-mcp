import { describe, it, expect } from "vitest";
import { TasksApi } from "../../src/api/tasks.js";
import { jsonFetch, httpWith, sent } from "./helpers.js";

const rawTask = { id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8, assignees: ["a2318d51-uuid"], dueDate: "2026-07-22", isCompleted: false };

describe("TasksApi", () => {
  it("list GETs /tm/tasks with the query and normalises each task", async () => {
    const f = jsonFetch(200, { success: true, tasks: [rawTask] });
    const out = await new TasksApi(httpWith(f)).list({ projectId: 2, perPage: 20 });
    expect(out).toEqual([{ id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8, assignees: ["a2318d51-uuid"], dueDate: "2026-07-22", completed: false, attachments: [] }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks?projectId=2&perPage=20");
  });

  it("create POSTs title + locations and optional fields only when given", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, id: 5 } });
    const t = await new TasksApi(httpWith(f)).create({ title: "T", projectId: 1, boardColumnId: 2, userId: "u1", dayFrom: "2026-08-01" });
    expect(t.id).toBe(5);
    const { url, init, json } = sent(f);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks");
    expect(init.method).toBe("POST");
    expect(json()).toEqual({ title: "T", locations: [{ projectId: 1, boardColumnId: 2 }], userId: "u1", dayFrom: "2026-08-01" });
  });

  it("get surfaces assignees, boardId, dueDate and attachments", async () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "m.png", url: "https://api.weeek.net/f/1", size: 10, createdAt: "2026-08-01T10:00:00Z" };
    const f = jsonFetch(200, { success: true, task: { ...rawTask, attachments: [att] } });
    const t = await new TasksApi(httpWith(f)).get(78);
    expect(t.attachments).toEqual([att]);
    expect(t.boardId).toBe(3);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
  });

  it("get defaults assignees and attachments to [] when absent", async () => {
    const f = jsonFetch(200, { success: true, task: { id: 1, title: "T" } });
    const t = await new TasksApi(httpWith(f)).get(1);
    expect(t.assignees).toEqual([]);
    expect(t.attachments).toEqual([]);
    expect(t.boardId).toBeNull();
  });

  it("update PUTs the patch", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).update(78, { title: "New" });
    const { url, init, json } = sent(f);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
    expect(init.method).toBe("PUT");
    expect(json()).toEqual({ title: "New" });
  });

  it("remove DELETEs and returns the success envelope", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new TasksApi(httpWith(f)).remove(9)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/9");
  });

  it("setCompleted posts to /complete or /un-complete, then re-reads the task", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, isCompleted: true } });
    const t = await new TasksApi(httpWith(f)).setCompleted({ id: 78, completed: true });
    expect(t.completed).toBe(true);
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/complete");
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).setCompleted({ id: 78, completed: false });
    expect(sent(g, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/un-complete");
  });

  it("move posts board then board-column, then fetches the task", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).move({ id: 7, boardId: 3, boardColumnId: 4 });
    expect(f.mock.calls.length).toBe(3);
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/board");
    expect(sent(f, 0).json()).toEqual({ boardId: 3 });
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/board-column");
    expect(sent(f, 1).json()).toEqual({ boardColumnId: 4 });
    expect(sent(f, 2).url).toBe("https://api.weeek.net/public/v1/tm/tasks/7");
  });

  it("uploadAttachment posts multipart files[] and returns the attachments as a list — object or array shape", async () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "f.md", url: "http://x", size: 3, createdAt: "2026-08-01T10:00:00Z" };
    const single = jsonFetch(200, { success: true, data: att });
    expect(await new TasksApi(httpWith(single)).uploadAttachment({ id: 7, filename: "f.md", data: new Uint8Array([1, 2, 3]) })).toEqual([att]);
    const { url, init } = sent(single);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/attachments");
    expect(init.body).toBeInstanceOf(FormData);
    expect(((init.body as FormData).get("files[]") as File).name).toBe("f.md");
    expect(init.headers).not.toHaveProperty("content-type");
    const list = jsonFetch(200, { success: true, data: [att] });
    expect(await new TasksApi(httpWith(list)).uploadAttachment({ id: 7, filename: "f.md", data: new Uint8Array([1]) })).toEqual([att]);
  });
});
