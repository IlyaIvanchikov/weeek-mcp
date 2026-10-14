import { describe, it, expect, vi } from "vitest";
import { TasksApi } from "../../src/api/tasks.js";
import { jsonFetch, httpWith, sent, type FetchStub } from "../helpers/http.js";

const rawTask = {
  id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8,
  assignees: ["a2318d51-uuid"], dueDate: "2026-07-22", isCompleted: false,
  parentId: null, priority: 2, type: "action", subscribers: ["u7"], tags: [5], subTasks: [80],
  locations: [{ projectId: 2, boardId: 3, boardColumnId: 8 }],
  timeEntries: [{ id: "te1", userId: "u1", date: "2026-07-20", duration: 30, isOvertime: false, comment: "" }],
  authorId: "u1", createdAt: "2026-07-01T10:00:00Z", startDate: "2026-07-20", duration: 60,
};
const entryFields = { userId: "u1", date: "2026-07-20", duration: 45, isOvertime: true };
const entryBody = { ...entryFields, isOvertime: 1 };
const rawEntry = { id: "te9", ...entryFields, comment: "", type: 1 };
const expectedEntry = { id: "te9", ...entryFields, comment: "" };
// The same task after toTask: what every tool returns to the model.
const normalisedTask = {
  id: 78, title: "T", description: null, projectId: 2, boardId: 3, boardColumnId: 8,
  parentId: null, subTasks: [80], assignees: ["a2318d51-uuid"], watchers: ["u7"], authorId: "u1",
  priority: "high", type: "action", startDate: "2026-07-20", dueDate: "2026-07-22",
  completed: false, completedAt: null, createdAt: "2026-07-01T10:00:00Z", duration: 60, tags: [5],
  locations: [{ projectId: 2, boardId: 3, boardColumnId: 8 }],
  timeEntries: [{ id: "te1", userId: "u1", date: "2026-07-20", duration: 30, isOvertime: false, comment: "" }],
  attachments: [],
};

describe("TasksApi", () => {
  it("list GETs /tm/tasks with the query and normalises each task", async () => {
    const f = jsonFetch(200, { success: true, tasks: [rawTask] });
    const out = await new TasksApi(httpWith(f)).list({ projectId: 2, perPage: 20 });
    expect(out).toEqual([normalisedTask]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks?projectId=2&perPage=20");
  });

  it("create POSTs title + locations and optional fields only when given", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, id: 5 } });
    const t = await new TasksApi(httpWith(f)).create({ title: "T", projectId: 1, boardColumnId: 2, userId: "u1", dayFrom: "2026-08-01", priority: 2, type: "call", parentId: 70 });
    expect(t.id).toBe(5);
    const { url, init, json } = sent(f);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks");
    expect(init.method).toBe("POST");
    expect(json()).toEqual({ title: "T", locations: [{ projectId: 1, boardColumnId: 2 }], userId: "u1", dayFrom: "2026-08-01", priority: 2, type: "call", parentId: 70 });
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
    expect(t.watchers).toEqual([]);
    expect(t.tags).toEqual([]);
    expect(t.subTasks).toEqual([]);
    expect(t.locations).toEqual([]);
    expect(t.timeEntries).toEqual([]);
    expect(t.priority).toBeNull();
    expect(t.type).toBeNull();
    expect(t.parentId).toBeNull();
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
    const t = await new TasksApi(httpWith(f)).setCompleted({ taskId: 78, completed: true });
    expect(t.completed).toBe(true);
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/complete");
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).setCompleted({ taskId: 78, completed: false });
    expect(sent(g, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/un-complete");
  });

  it("move posts board then board-column, then fetches the task", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).move({ taskId: 7, boardId: 3, boardColumnId: 4 });
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
    expect(await new TasksApi(httpWith(single)).uploadAttachment({ taskId: 7, filename: "f.md", bytes: new Uint8Array([1, 2, 3]) })).toEqual([att]);
    const { url, init } = sent(single);
    expect(url).toBe("https://api.weeek.net/public/v1/tm/tasks/7/attachments");
    expect(init.body).toBeInstanceOf(FormData);
    expect(((init.body as FormData).get("files[]") as File).name).toBe("f.md");
    expect(init.headers).not.toHaveProperty("content-type");
    const list = jsonFetch(200, { success: true, data: [att] });
    expect(await new TasksApi(httpWith(list)).uploadAttachment({ taskId: 7, filename: "f.md", bytes: new Uint8Array([1]) })).toEqual([att]);
  });

  it("listComments GETs the page and normalises comments", async () => {
    const raw = { id: 9, parentId: null, authorId: "u1", markdown: "hi", createdAt: "2026-07-01T10:00:00Z", updatedAt: "2026-07-01T10:00:00Z" };
    const f = jsonFetch(200, { comments: [raw], hasMore: true });
    expect(await new TasksApi(httpWith(f)).listComments({ taskId: 78, limit: 10, offset: 20 })).toEqual({ comments: [raw], hasMore: true });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/comments?limit=10&offset=20");
  });

  it("addComment POSTs markdown and only sends parentId when replying", async () => {
    const raw = { id: 10, parentId: 9, authorId: "u1", markdown: "re", createdAt: "x", updatedAt: "x" };
    const f = jsonFetch(200, { comment: raw });
    expect(await new TasksApi(httpWith(f)).addComment({ taskId: 78, markdown: "re", parentId: 9 })).toEqual(raw);
    expect(sent(f).json()).toEqual({ markdown: "re", parentId: 9 });
    const g = jsonFetch(200, { comment: { ...raw, parentId: null } });
    await new TasksApi(httpWith(g)).addComment({ taskId: 78, markdown: "top" });
    expect(sent(g).json()).toEqual({ markdown: "top" });
  });

  it("removeComment DELETEs, accepts an empty 204 body and answers with the success envelope", async () => {
    const f = vi.fn<FetchStub>(async () => new Response(null, { status: 204 }));
    expect(await new TasksApi(httpWith(f)).removeComment({ taskId: 78, commentId: 9 })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/comments/9");
  });

  it.each([
    ["addAssignees", "POST", "assignees", "assignees"],
    ["removeAssignees", "DELETE", "assignees", "assignees"],
    ["addWatchers", "POST", "watchers", "watchers"],
    ["removeWatchers", "DELETE", "watchers", "watchers"],
  ] as const)("%s sends %s /%s with the member ids, then re-reads the task", async (method, verb, segment, bodyKey) => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    const t = await new TasksApi(httpWith(f))[method]({ taskId: 78, memberIds: ["u1", "u2"] });
    expect(t).toEqual(normalisedTask);
    expect(sent(f, 0).init.method).toBe(verb);
    expect(sent(f, 0).url).toBe(`https://api.weeek.net/public/v1/tm/tasks/78/${segment}`);
    expect(sent(f, 0).json()).toEqual({ [bodyKey]: ["u1", "u2"] });
    expect(sent(f, 1).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
  });

  it("addLocation POSTs the project and the column only when given; the API answers 204", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, task: rawTask }), { status: 200 }));
    await new TasksApi(httpWith(f)).addLocation({ taskId: 78, projectId: 4 });
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/locations");
    expect(sent(f, 0).json()).toEqual({ projectId: 4 });
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).addLocation({ taskId: 78, projectId: 4, boardColumnId: 12 });
    expect(sent(g, 0).json()).toEqual({ projectId: 4, boardColumnId: 12 });
  });

  it("removeLocation DELETEs with the project in the body", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).removeLocation({ taskId: 78, projectId: 4 });
    expect(sent(f, 0).init.method).toBe("DELETE");
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/locations");
    expect(sent(f, 0).json()).toEqual({ projectId: 4 });
  });

  it("setParent sends parentId, including an explicit null to detach", async () => {
    const f = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(f)).setParent({ taskId: 80, parentId: 78 });
    expect(sent(f, 0).url).toBe("https://api.weeek.net/public/v1/tm/tasks/80/parent");
    expect(sent(f, 0).json()).toEqual({ parentId: 78 });
    const g = jsonFetch(200, { success: true, task: rawTask });
    await new TasksApi(httpWith(g)).setParent({ taskId: 80, parentId: null });
    expect(sent(g, 0).json()).toEqual({ parentId: null });
    expect(Object.keys(sent(g, 0).json())).toContain("parentId");
  });

  it.each([["startTimer", "start-timer"], ["stopTimer", "stop-timer"]] as const)("%s POSTs /%s and returns the envelope", async (method, segment) => {
    const f = jsonFetch(200, { success: true });
    expect(await new TasksApi(httpWith(f))[method](78)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(`https://api.weeek.net/public/v1/tm/tasks/78/${segment}`);
  });

  it("addTimeEntry POSTs the four fields and returns the entry", async () => {
    const f = jsonFetch(200, { success: true, data: rawEntry });
    expect(await new TasksApi(httpWith(f)).addTimeEntry({ taskId: 78, entry: entryFields })).toEqual(expectedEntry);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/time-entries");
    expect(sent(f).json()).toEqual(entryBody);
  });

  it("updateTimeEntry PUTs the four fields to the entry's path", async () => {
    const f = jsonFetch(200, { success: true, data: rawEntry });
    expect(await new TasksApi(httpWith(f)).updateTimeEntry({ taskId: 78, timeEntryId: "te9", entry: entryFields })).toEqual(expectedEntry);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/time-entries/te9");
    expect(sent(f).json()).toEqual(entryBody);
  });

  it("sends a false isOvertime as 0", async () => {
    const f = jsonFetch(200, { success: true, data: rawEntry });
    await new TasksApi(httpWith(f)).addTimeEntry({ taskId: 78, entry: { ...entryFields, isOvertime: false } });
    expect(sent(f).json()).toEqual({ ...entryBody, isOvertime: 0 });
  });

  it("removeTimeEntry DELETEs the entry's path", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new TasksApi(httpWith(f)).removeTimeEntry({ taskId: 78, timeEntryId: "te9" })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78/time-entries/te9");
  });

  it("get drops malformed locations and timeEntries instead of failing", async () => {
    const f = jsonFetch(200, { success: true, task: { ...rawTask, locations: "x", timeEntries: null } });
    const t = await new TasksApi(httpWith(f)).get(78);
    expect(t.locations).toEqual([]);
    expect(t.timeEntries).toEqual([]);
  });

  it("getFields reads a task's fields with their options off GET /tm/tasks/{id}", async () => {
    const rawField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", options: [{ id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" }], value: null };
    const f = jsonFetch(200, { success: true, task: { ...rawTask, customFields: [rawField] } });
    expect(await new TasksApi(httpWith(f)).getFields(78)).toEqual([{ id: rawField.id, name: "Stage", type: "select", config: null, options: rawField.options }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks/78");
  });

  it("sampleBoardFields reads one task of the board, with every task state, and the project it sits in there", async () => {
    const rawField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "text", options: [], value: "x" };
    const f = jsonFetch(200, { success: true, tasks: [{ ...rawTask, locations: [{ projectId: 9, boardId: 1 }, { projectId: 2, boardId: 3 }], customFields: [rawField] }] });
    expect(await new TasksApi(httpWith(f)).sampleBoardFields(3)).toEqual({ projectId: 2, fields: [{ id: rawField.id, name: "Stage", type: "text", config: null, options: [] }] });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/tasks?boardId=3&perPage=1&all=1");
  });

  it("sampleBoardFields is null for a board without tasks", async () => {
    const f = jsonFetch(200, { success: true, tasks: [] });
    expect(await new TasksApi(httpWith(f)).sampleBoardFields(3)).toBeNull();
  });
});
