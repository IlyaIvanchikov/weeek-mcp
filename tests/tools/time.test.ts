import { describe, it, expect, vi } from "vitest";
import { registerTimeTools } from "../../src/tools/time.js";
import { toolHarness, reply, stubMembers } from "../helpers/tool-harness.js";

const [ilya, ann] = stubMembers;
const entry = { id: "te9", userId: ilya.id, date: "2026-07-20", duration: 45, isOvertime: false, comment: "" };
const client = () => ({
  workspace: { listMembers: async () => stubMembers },
  user: { me: async () => ({ id: ilya.id, name: "Ilya", email: "i@x.y", language: null, timeZone: null }) },
});

describe("time tools", () => {
  it("weeek_set_timer starts or stops the timer", async () => {
    const startTimer = vi.fn(async () => ({ success: true }));
    const stopTimer = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { startTimer, stopTimer } });
    await h.call("weeek_set_timer", { id: 78, running: true });
    expect(startTimer).toHaveBeenCalledWith(78);
    expect(stopTimer).not.toHaveBeenCalled();
    await h.call("weeek_set_timer", { id: 78, running: false });
    expect(stopTimer).toHaveBeenCalledWith(78);
  });

  it("weeek_add_time_entry defaults the member to the token's owner and parses the date", async () => {
    const addTimeEntry = vi.fn(async () => entry);
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { addTimeEntry } });
    expect(reply(await h.call("weeek_add_time_entry", { id: 78, date: "2026-07-20", minutes: 45 }))).toEqual(entry);
    expect(addTimeEntry).toHaveBeenCalledWith({ taskId: 78, entry: { userId: ilya.id, date: "2026-07-20", duration: 45, isOvertime: false } });
  });

  it("weeek_add_time_entry resolves a member by name and takes overtime", async () => {
    const addTimeEntry = vi.fn(async () => entry);
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { addTimeEntry } });
    await h.call("weeek_add_time_entry", { id: 78, date: "2026-07-20", minutes: 10, member: "ann", overtime: true });
    expect(addTimeEntry).toHaveBeenCalledWith({ taskId: 78, entry: { userId: ann.id, date: "2026-07-20", duration: 10, isOvertime: true } });
  });

  it("weeek_add_time_entry rejects more than a day of minutes before any call", async () => {
    const addTimeEntry = vi.fn();
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { addTimeEntry } });
    expect(() => h.call("weeek_add_time_entry", { id: 78, date: "2026-07-20", minutes: 1441 })).toThrow();
    expect(addTimeEntry).not.toHaveBeenCalled();
  });

  it("weeek_update_time_entry merges the given fields over the current entry", async () => {
    const get = vi.fn(async () => ({ id: 78, timeEntries: [entry] }));
    const updateTimeEntry = vi.fn(async () => ({ ...entry, duration: 60 }));
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { get, updateTimeEntry } });
    expect(reply(await h.call("weeek_update_time_entry", { id: 78, entry_id: "te9", minutes: 60 }))).toEqual({ ...entry, duration: 60 });
    expect(updateTimeEntry).toHaveBeenCalledWith({ taskId: 78, timeEntryId: "te9", entry: { userId: ilya.id, date: "2026-07-20", duration: 60, isOvertime: false } });
  });

  it("weeek_update_time_entry refuses an entry that is not on the task", async () => {
    const updateTimeEntry = vi.fn();
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { get: async () => ({ id: 78, timeEntries: [] }), updateTimeEntry } });
    const res = await h.call("weeek_update_time_entry", { id: 78, entry_id: "nope", minutes: 5 });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/time entry nope is not on task 78/);
    expect(updateTimeEntry).not.toHaveBeenCalled();
  });

  it("weeek_delete_time_entry needs confirm:true", async () => {
    const removeTimeEntry = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerTimeTools, { ...client(), tasks: { removeTimeEntry } });
    expect(() => h.call("weeek_delete_time_entry", { id: 78, entry_id: "te9" })).toThrow(/confirm/);
    expect(removeTimeEntry).not.toHaveBeenCalled();
    await h.call("weeek_delete_time_entry", { id: 78, entry_id: "te9", confirm: true });
    expect(removeTimeEntry).toHaveBeenCalledWith({ taskId: 78, timeEntryId: "te9" });
  });
});
