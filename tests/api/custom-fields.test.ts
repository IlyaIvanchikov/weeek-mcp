import { describe, it, expect, vi } from "vitest";
import { CustomFieldsApi, toCustomField, toFieldValue } from "../../src/api/custom-fields.js";
import type { CustomField, FieldScope } from "../../src/api/types.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const base = "https://api.weeek.net/public/v1";
const fieldId = "0b1e4d7c-1111-4aaa-8bbb-000000000001";
const optionId = "0b1e4d7c-2222-4aaa-8bbb-000000000002";
const otherOptionId = "0b1e4d7c-3333-4aaa-8bbb-000000000003";
const rawField = { id: fieldId, name: "Stage", type: "select", config: null, options: [{ id: optionId, name: "Review", color: "blue" }] };
const field: CustomField = { id: fieldId, name: "Stage", type: "select", config: null, options: [{ id: optionId, name: "Review", color: "blue" }] };
const option = { id: optionId, name: "Review", color: "blue" };
const globalScope: FieldScope = { kind: "global" };
const projectScope: FieldScope = { kind: "project", projectId: 2 };
const boardScope: FieldScope = { kind: "board", boardId: 3 };
const funnelScope: FieldScope = { kind: "funnel", funnelId: "OLY24hy2mC7n9D9l" };

/** The sibling clients CustomFieldsApi composes; each test overrides what it needs. */
const siblings = (over: Record<string, unknown> = {}) => ({
  projects: { get: vi.fn(async () => ({ id: 2, customFields: [] })) },
  tasks: { sampleBoardFields: vi.fn(async () => null) },
  funnels: { list: vi.fn(async () => []) },
  ...over,
}) as any;
const api = (f: ReturnType<typeof jsonFetch>, over: Record<string, unknown> = {}) => new CustomFieldsApi(httpWith(f), siblings(over));

describe("toCustomField", () => {
  it("normalises a field with its options and a number config", () => {
    expect(toCustomField({ id: fieldId, name: "Estimate", type: "number", config: { type: "currency", precision: "2", currency: 3 }, options: [] }))
      .toEqual({ id: fieldId, name: "Estimate", type: "number", config: { type: "currency", precision: 2, currency: 3 }, options: [] });
  });
  it("nulls an unknown type and a config it cannot read, and defaults options to []", () => {
    expect(toCustomField({ id: fieldId, name: null, type: "rating", config: { type: "stars" } })).toEqual({ id: fieldId, name: "", type: null, config: null, options: [] });
  });
  it("reads a boolean config", () => {
    expect(toCustomField({ id: fieldId, type: "boolean", config: { type: "radio" } }).config).toEqual({ type: "radio" });
  });
});

describe("CustomFieldsApi.list", () => {
  it("global GETs /tm/custom-fields and reads data", async () => {
    const f = jsonFetch(200, { success: true, data: [rawField] });
    expect(await api(f).list(globalScope)).toEqual([field]);
    expect(sent(f).url).toBe(`${base}/tm/custom-fields`);
  });
  it("project reads the project's customFields through the projects client", async () => {
    const get = vi.fn(async () => ({ id: 2, customFields: [field] }));
    expect(await api(jsonFetch(200, {}), { projects: { get } }).list(projectScope)).toEqual([field]);
    expect(get).toHaveBeenCalledWith(2);
  });
  it("funnel reads the funnel's customFields from the funnel list and fails for an unknown funnel", async () => {
    const list = vi.fn(async () => [{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [field] }]);
    expect(await api(jsonFetch(200, {}), { funnels: { list } }).list(funnelScope)).toEqual([field]);
    await expect(api(jsonFetch(200, {}), { funnels: { list } }).list({ kind: "funnel", funnelId: "nope" })).rejects.toThrow(/funnel nope/);
  });
  it("board samples the board's tasks and subtracts the global fields and the fields of every project they sit in", async () => {
    const globalField = { ...field, id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Global" };
    const projectField = { ...field, id: "0b1e4d7c-5555-4aaa-8bbb-000000000005", name: "Project" };
    const otherProjectField = { ...field, id: "0b1e4d7c-6666-4aaa-8bbb-000000000006", name: "Other project" };
    const f = jsonFetch(200, { success: true, data: [globalField] });
    const sampleBoardFields = vi.fn(async () => ({ projectIds: [2, 9], fields: [globalField, projectField, otherProjectField, field] }));
    const get = vi.fn(async (projectId: number) => ({ id: projectId, customFields: [projectId === 2 ? projectField : otherProjectField] }));
    expect(await api(f, { tasks: { sampleBoardFields }, projects: { get } }).list(boardScope)).toEqual([field]);
    expect(sampleBoardFields).toHaveBeenCalledWith(3);
    expect(get).toHaveBeenCalledWith(2);
    expect(get).toHaveBeenCalledWith(9);
  });
  it("board lists nothing when the board has no task", async () => {
    expect(await api(jsonFetch(200, { success: true, data: [rawField] })).list(boardScope)).toEqual([]);
  });
});

describe("CustomFieldsApi writes", () => {
  it.each([
    [globalScope, `${base}/tm/custom-fields`],
    [projectScope, `${base}/tm/projects/2/custom-fields`],
    [boardScope, `${base}/tm/boards/3/custom-fields`],
    [funnelScope, `${base}/crm/funnels/OLY24hy2mC7n9D9l/custom-fields`],
  ])("create POSTs to the scope's route %#", async (scope, url) => {
    const f = jsonFetch(200, { success: true, customField: rawField });
    expect(await api(f).create({ scope, field: { name: "Stage", type: "select" } })).toEqual(field);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(url);
    expect(sent(f).json()).toEqual({ name: "Stage", type: "select" });
  });

  it("create sends the config when given", async () => {
    const f = jsonFetch(200, { success: true, customField: rawField });
    await api(f).create({ scope: globalScope, field: { name: "Estimate", type: "number", config: { type: "number", precision: 1 } } });
    expect(sent(f).json()).toEqual({ name: "Estimate", type: "number", config: { type: "number", precision: 1 } });
  });

  it("create reads the field from `data` when the route answers that way — the board route does (FOLLOWUPS 23 a)", async () => {
    const f = jsonFetch(200, { success: true, data: { id: fieldId, name: "Lane", type: "text" } });
    expect(await api(f).create({ scope: boardScope, field: { name: "Lane", type: "text" } })).toEqual({ id: fieldId, name: "Lane", type: "text", config: null, options: [] });
  });

  it("createOption reads the option from `data` too", async () => {
    const f = jsonFetch(200, { success: true, data: { id: optionId, name: "Review", color: "#FFCC48" } });
    expect(await api(f).createOption({ scope: boardScope, fieldId, option: { name: "Review", color: "blue" } })).toEqual({ id: optionId, name: "Review", color: "#FFCC48" });
  });

  it("update PUTs only the fields given and returns the field", async () => {
    const f = jsonFetch(200, { success: true, customField: rawField });
    expect(await api(f).update({ scope: projectScope, fieldId, update: { name: "Phase" } })).toEqual(field);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/tm/projects/2/custom-fields/${fieldId}`);
    expect(sent(f).json()).toEqual({ name: "Phase" });
  });

  it("remove DELETEs the field", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).remove({ scope: boardScope, fieldId })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/tm/boards/3/custom-fields/${fieldId}`);
  });

  it.each([
    [globalScope, { kind: "project", projectId: 9 }, `${base}/tm/custom-fields/${fieldId}/transfer-to-project`, { projectId: 9 }],
    [globalScope, { kind: "board", boardId: 8 }, `${base}/tm/custom-fields/${fieldId}/transfer-to-board`, { boardId: 8 }],
    [projectScope, { kind: "global" }, `${base}/tm/projects/2/custom-fields/${fieldId}/transfer-to-task-manager`, undefined],
    [projectScope, { kind: "project", projectId: 9 }, `${base}/tm/projects/2/custom-fields/${fieldId}/transfer-to-project`, { projectId: 9 }],
    [projectScope, { kind: "board", boardId: 8 }, `${base}/tm/projects/2/custom-fields/${fieldId}/transfer-to-board`, { boardId: 8 }],
    [boardScope, { kind: "global" }, `${base}/tm/boards/3/custom-fields/${fieldId}/transfer-to-task-manager`, undefined],
    [boardScope, { kind: "project", projectId: 9 }, `${base}/tm/boards/3/custom-fields/${fieldId}/transfer-to-project`, { projectId: 9 }],
    [boardScope, { kind: "board", boardId: 8 }, `${base}/tm/boards/3/custom-fields/${fieldId}/transfer-to-board`, { boardId: 8 }],
  ] as const)("transfer %# POSTs the right route and body", async (scope, target, url, body) => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).transfer({ scope, fieldId, target })).toEqual({ success: true });
    expect(sent(f).url).toBe(url);
    if (body === undefined) expect(sent(f).init.body).toBeUndefined();
    else expect(sent(f).json()).toEqual(body);
  });

  it("transfer refuses a project into its own project and a board into its own board before sending", async () => {
    const f = jsonFetch(200, { success: true });
    await expect(api(f).transfer({ scope: projectScope, fieldId, target: { kind: "project", projectId: 2 } })).rejects.toThrow("the field is already in that project");
    await expect(api(f).transfer({ scope: boardScope, fieldId, target: { kind: "board", boardId: 3 } })).rejects.toThrow("the field is already in that board");
    expect(f).not.toHaveBeenCalled();
  });

  it("transfer refuses global→global and any funnel field before sending", async () => {
    const f = jsonFetch(200, { success: true });
    await expect(api(f).transfer({ scope: globalScope, fieldId, target: { kind: "global" } })).rejects.toThrow(/already global/);
    await expect(api(f).transfer({ scope: funnelScope, fieldId, target: { kind: "global" } })).rejects.toThrow(/funnel/);
    expect(f).not.toHaveBeenCalled();
  });

  it("move POSTs the one neighbour given", async () => {
    const f = jsonFetch(200, { success: true });
    await api(f).move({ funnelId: "OLY24hy2mC7n9D9l", fieldId, placement: { after: otherOptionId } });
    expect(sent(f).url).toBe(`${base}/crm/funnels/OLY24hy2mC7n9D9l/custom-fields/${fieldId}/move`);
    expect(sent(f).json()).toEqual({ after: otherOptionId });
  });

  it("createOption POSTs name + color and returns the option", async () => {
    const f = jsonFetch(200, { success: true, option });
    expect(await api(f).createOption({ scope: globalScope, fieldId, option: { name: "Review", color: "blue" } })).toEqual(option);
    expect(sent(f).url).toBe(`${base}/tm/custom-fields/${fieldId}/options`);
    expect(sent(f).json()).toEqual({ name: "Review", color: "blue" });
  });

  it("updateOption PUTs both fields to the option's path", async () => {
    const f = jsonFetch(200, { success: true, option });
    expect(await api(f).updateOption({ scope: funnelScope, fieldId, optionId, option: { name: "Review", color: "red" } })).toEqual(option);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/crm/funnels/OLY24hy2mC7n9D9l/custom-fields/${fieldId}/options/${optionId}`);
    expect(sent(f).json()).toEqual({ name: "Review", color: "red" });
  });

  it("removeOption DELETEs the option", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).removeOption({ scope: projectScope, fieldId, optionId })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/tm/projects/2/custom-fields/${fieldId}/options/${optionId}`);
  });

  it("moveOption POSTs before only", async () => {
    const f = jsonFetch(200, { success: true });
    await api(f).moveOption({ scope: boardScope, fieldId, optionId, placement: { before: otherOptionId } });
    expect(sent(f).url).toBe(`${base}/tm/boards/3/custom-fields/${fieldId}/options/${optionId}/move`);
    expect(sent(f).json()).toEqual({ before: otherOptionId });
  });
});

describe("toFieldValue", () => {
  it("shows option ids as names and keeps primitives", () => {
    const option = { id: "o1", name: "Review", color: "blue" };
    expect(toFieldValue({ id: "f1", name: "Stage", type: "select", options: [option], value: "o1" })).toEqual({ id: "f1", name: "Stage", type: "select", value: "Review" });
    expect(toFieldValue({ id: "f2", name: "Estimate", type: "number", options: [], value: 5 })).toEqual({ id: "f2", name: "Estimate", type: "number", value: 5 });
  });
});
