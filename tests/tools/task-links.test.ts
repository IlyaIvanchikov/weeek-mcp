import { describe, it, expect, vi } from "vitest";
import { registerTaskLinkTools } from "../../src/tools/task-links.js";
import { toolHarness, reply, stubMembers } from "../helpers/tool-harness.js";

const task = { id: 78, title: "T" };
const [ilya, ann] = stubMembers;
const client = () => ({
  workspace: { listMembers: async () => stubMembers },
  projects: { list: async () => [{ id: 1, name: "Marketing" }, { id: 2, name: "Sales" }] },
  boards: { list: async () => [{ id: 10, name: "Main" }] },
  columns: { list: async () => [{ id: 100, name: "Done" }] },
});

describe("task link tools", () => {
  it.each([
    ["weeek_add_assignees", "assignees", "addAssignees"],
    ["weeek_add_watchers", "watchers", "addWatchers"],
  ])("%s resolves member names and ids, then calls %s", async (tool, field, method) => {
    const fn = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { [method]: fn } });
    expect(reply(await h.call(tool, { id: 78, [field]: ["ilya", ann.id] }))).toEqual(task);
    expect(fn).toHaveBeenCalledWith({ taskId: 78, memberIds: [ilya.id, ann.id] });
  });

  it.each([
    ["weeek_remove_assignees", "assignees", "removeAssignees"],
    ["weeek_remove_watchers", "watchers", "removeWatchers"],
  ])("%s needs confirm:true, then detaches", async (tool, field, method) => {
    const fn = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { [method]: fn } });
    expect(() => h.call(tool, { id: 78, [field]: ["Ann"] })).toThrow();
    expect(fn).not.toHaveBeenCalled();
    await h.call(tool, { id: 78, [field]: ["Ann"], confirm: true });
    expect(fn).toHaveBeenCalledWith({ taskId: 78, memberIds: [ann.id] });
  });

  it("weeek_add_assignees reports an unknown member with candidates instead of calling the API", async () => {
    const addAssignees = vi.fn();
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { addAssignees } });
    const res = await h.call("weeek_add_assignees", { id: 78, assignees: ["Nobody"] });
    expect(res.isError).toBe(true);
    expect(reply(res)).toMatchObject({ error: expect.stringMatching(/could not resolve assignee "Nobody"/), candidates: [] });
    expect(addAssignees).not.toHaveBeenCalled();
  });

  it("weeek_add_task_to_project resolves the project and the column inside it", async () => {
    const addLocation = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { addLocation } });
    await h.call("weeek_add_task_to_project", { id: 78, project: "sales" });
    expect(addLocation).toHaveBeenCalledWith({ taskId: 78, projectId: 2, boardColumnId: undefined });
    await h.call("weeek_add_task_to_project", { id: 78, project: "Marketing", column: "done" });
    expect(addLocation).toHaveBeenLastCalledWith({ taskId: 78, projectId: 1, boardColumnId: 100 });
  });

  it("weeek_remove_task_from_project needs confirm:true", async () => {
    const removeLocation = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { removeLocation } });
    expect(() => h.call("weeek_remove_task_from_project", { id: 78, project: 2 })).toThrow();
    await h.call("weeek_remove_task_from_project", { id: 78, project: 2, confirm: true });
    expect(removeLocation).toHaveBeenCalledWith({ taskId: 78, projectId: 2 });
  });

  it("weeek_set_task_parent sends the parent id, and an explicit null to detach", async () => {
    const setParent = vi.fn(async () => task);
    const h = toolHarness(registerTaskLinkTools, { ...client(), tasks: { setParent } });
    await h.call("weeek_set_task_parent", { id: 80, parent: 78 });
    expect(setParent).toHaveBeenCalledWith({ taskId: 80, parentId: 78 });
    await h.call("weeek_set_task_parent", { id: 80, parent: null });
    expect(setParent).toHaveBeenLastCalledWith({ taskId: 80, parentId: null });
    expect(() => h.call("weeek_set_task_parent", { id: 80 })).toThrow();
  });
});
