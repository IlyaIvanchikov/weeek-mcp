import { describe, it, expect, vi } from "vitest";
import { registerCustomFieldTools } from "../../src/tools/custom-fields.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";
import type { CustomField, FieldScope } from "../../src/client.js";

const review = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" };
const done = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Done", color: "green" };
const stage: CustomField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [review, done] };
const estimate: CustomField = { id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Estimate", type: "number", config: { type: "number", precision: 0 }, options: [] };
const ok = { success: true };
const funnelId = "OLY24hy2mC7n9D9l";
const client = () => ({
  projects: { list: vi.fn(async () => [{ id: 1, name: "Marketing" }]) },
  boards: { list: vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]) },
  crm: { funnels: { list: vi.fn(async () => [{ id: funnelId, name: "Sales", customFields: [] }]) } },
  customFields: {
    list: vi.fn(async (_scope: FieldScope) => [stage, estimate]),
    create: vi.fn(async () => stage), update: vi.fn(async () => stage), remove: vi.fn(async () => ok),
    transfer: vi.fn(async () => ok), move: vi.fn(async () => ok),
    createOption: vi.fn(async () => review), updateOption: vi.fn(async () => review), removeOption: vi.fn(async () => ok), moveOption: vi.fn(async () => ok),
  },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerCustomFieldTools, c) }; };

describe("custom-field tools", () => {
  it("weeek_list_custom_fields resolves each scope's owner by name", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_custom_fields", { scope: "global" }))).toEqual([stage, estimate]);
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "global" });
    await h.call("weeek_list_custom_fields", { scope: "project", project: "marketing" });
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "project", projectId: 1 });
    await h.call("weeek_list_custom_fields", { scope: "board", board: "main", project: "Marketing" });
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "board", boardId: 10 });
    await h.call("weeek_list_custom_fields", { scope: "funnel", funnel: "sales" });
    expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "funnel", funnelId });
  });

  it("weeek_list_custom_fields reports a missing owner without calling the API", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_list_custom_fields", { scope: "project" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/scope "project" needs `project`/);
    expect(c.customFields.list).not.toHaveBeenCalled();
  });

  it("weeek_create_custom_field sends the type and the settings its type takes", async () => {
    const { c, h } = harness();
    await h.call("weeek_create_custom_field", { scope: "project", project: 1, name: "Stage", type: "select" });
    expect(c.customFields.create).toHaveBeenLastCalledWith({ scope: { kind: "project", projectId: 1 }, field: { name: "Stage", type: "select" } });
    await h.call("weeek_create_custom_field", { scope: "global", name: "Cost", type: "number", number_format: "currency", precision: 2, currency_id: 1 });
    expect(c.customFields.create).toHaveBeenLastCalledWith({ scope: { kind: "global" }, field: { name: "Cost", type: "number", config: { type: "currency", precision: 2, currency: 1 } } });
  });

  it("weeek_create_custom_field refuses settings of another type before any call", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_create_custom_field", { scope: "global", name: "Flag", type: "boolean", precision: 1 });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/apply to number fields only/);
    expect(c.customFields.create).not.toHaveBeenCalled();
  });

  it("weeek_update_custom_field finds the field by name and merges settings over its current ones", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_custom_field", { scope: "global", field: "estimate", precision: 2 });
    expect(c.customFields.update).toHaveBeenLastCalledWith({ scope: { kind: "global" }, fieldId: estimate.id, update: { name: undefined, config: { type: "number", precision: 2 } } });
    await h.call("weeek_update_custom_field", { scope: "global", field: stage.id, name: "Phase" });
    expect(c.customFields.update).toHaveBeenLastCalledWith({ scope: { kind: "global" }, fieldId: stage.id, update: { name: "Phase", config: undefined } });
  });

  it("weeek_update_custom_field reports an unknown field with candidates", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_update_custom_field", { scope: "global", field: "Sta", name: "x" });
    expect(res.isError).toBe(true);
    expect(reply(res).candidates).toEqual([{ id: stage.id, name: "Stage" }]);
    expect(c.customFields.update).not.toHaveBeenCalled();
  });

  it("weeek_update_custom_field refuses a call that changes nothing, before any call", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_update_custom_field", { scope: "global", field: "Stage" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toBe("nothing to change: pass name or a setting");
    expect(c.customFields.list).not.toHaveBeenCalled();
    expect(c.customFields.update).not.toHaveBeenCalled();
  });

  it("weeek_update_field_option refuses a call that changes nothing, before any call", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_update_field_option", { scope: "global", field: "Stage", option: "Review" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toBe("nothing to change: pass name or color");
    expect(c.customFields.list).not.toHaveBeenCalled();
    expect(c.customFields.updateOption).not.toHaveBeenCalled();
  });

  it("weeek_delete_custom_field looks only inside the given scope and refuses a field that lives elsewhere", async () => {
    const { c, h } = harness();
    c.customFields.list.mockImplementation(async (scope: FieldScope) => (scope.kind === "global" ? [estimate] : []));
    const res = await h.call("weeek_delete_custom_field", { scope: "board", board: 10, field: "Estimate", confirm: true });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/could not resolve custom field "Estimate"/);
    expect(c.customFields.remove).not.toHaveBeenCalled();
  });

  it("weeek_delete_custom_field needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_custom_field", { scope: "global", field: "Stage" })).toThrow(/confirm/);
    await h.call("weeek_delete_custom_field", { scope: "global", field: "Stage", confirm: true });
    expect(c.customFields.remove).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id });
  });

  it("weeek_transfer_custom_field resolves the target and refuses a funnel field", async () => {
    const { c, h } = harness();
    await h.call("weeek_transfer_custom_field", { scope: "global", field: "Stage", to: "board", to_board: "Main", to_project: "Marketing" });
    expect(c.customFields.transfer).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, target: { kind: "board", boardId: 10 } });
    c.customFields.transfer.mockRejectedValueOnce(new Error("a funnel's custom fields stay in their funnel"));
    const res = await h.call("weeek_transfer_custom_field", { scope: "funnel", funnel: "Sales", field: "Stage", to: "global" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/stay in their funnel/);
  });

  it("weeek_move_custom_field places a funnel field after or before a sibling, exactly one", async () => {
    const { c, h } = harness();
    await h.call("weeek_move_custom_field", { funnel: "Sales", field: "Stage", after: "Estimate" });
    expect(c.customFields.move).toHaveBeenCalledWith({ funnelId, fieldId: stage.id, placement: { after: estimate.id } });
    const both = await h.call("weeek_move_custom_field", { funnel: funnelId, field: "Stage", after: "Estimate", before: "Estimate" });
    expect(reply(both).error).toMatch(/exactly one of after or before/);
    const neither = await h.call("weeek_move_custom_field", { funnel: funnelId, field: "Stage" });
    expect(reply(neither).error).toMatch(/exactly one of after or before/);
    expect(c.customFields.move).toHaveBeenCalledTimes(1);
  });

  it("weeek_add_field_option sends name and colour, and rejects a colour outside the palette", async () => {
    const { c, h } = harness();
    await h.call("weeek_add_field_option", { scope: "global", field: "Stage", name: "Blocked", color: "red" });
    expect(c.customFields.createOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, option: { name: "Blocked", color: "red" } });
    expect(() => h.call("weeek_add_field_option", { scope: "global", field: "Stage", name: "x", color: "magenta" })).toThrow(/color/);
  });

  it("weeek_update_field_option keeps the current name when only the colour changes", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_field_option", { scope: "global", field: "Stage", option: "review", color: "red" });
    expect(c.customFields.updateOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, optionId: review.id, option: { name: "Review", color: "red" } });
  });

  it("weeek_update_field_option reports an unknown option with candidates", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_update_field_option", { scope: "global", field: "Stage", option: "Reviw", name: "x" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/could not resolve option of Stage "Reviw"/);
    expect(c.customFields.updateOption).not.toHaveBeenCalled();
  });

  it("weeek_delete_field_option needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_field_option", { scope: "global", field: "Stage", option: "Done" })).toThrow(/confirm/);
    await h.call("weeek_delete_field_option", { scope: "global", field: "Stage", option: "Done", confirm: true });
    expect(c.customFields.removeOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, optionId: done.id });
  });

  it("weeek_move_field_option resolves both options from the field", async () => {
    const { c, h } = harness();
    await h.call("weeek_move_field_option", { scope: "global", field: "Stage", option: "Done", before: "Review" });
    expect(c.customFields.moveOption).toHaveBeenCalledWith({ scope: { kind: "global" }, fieldId: stage.id, optionId: done.id, placement: { before: review.id } });
  });

  // Each write must drop the cached field lists: warm, write, list again, expect a second fetch.
  describe.each([
    ["weeek_create_custom_field", { scope: "global", name: "N", type: "text" }],
    ["weeek_update_custom_field", { scope: "global", field: "Stage", name: "N" }],
    ["weeek_delete_custom_field", { scope: "global", field: "Stage", confirm: true }],
    ["weeek_transfer_custom_field", { scope: "global", field: "Stage", to: "project", to_project: 1 }],
    ["weeek_move_custom_field", { funnel: funnelId, field: "Stage", after: "Estimate" }],
    ["weeek_add_field_option", { scope: "global", field: "Stage", name: "N", color: "blue" }],
    ["weeek_update_field_option", { scope: "global", field: "Stage", option: "Done", name: "N" }],
    ["weeek_delete_field_option", { scope: "global", field: "Stage", option: "Done", confirm: true }],
    ["weeek_move_field_option", { scope: "global", field: "Stage", option: "Done", after: "Review" }],
  ])("%s forgets the field lists", (tool, args) => {
    it("so the next lookup loads again", async () => {
      const { c, h } = harness();
      await h.call("weeek_list_custom_fields", { scope: "global" });
      await h.call(tool, args);
      // A write may load its own scope first, so the count is taken after it: the next global list must be one fresh call.
      const after = c.customFields.list.mock.calls.length;
      await h.call("weeek_list_custom_fields", { scope: "global" });
      expect(c.customFields.list.mock.calls.length).toBe(after + 1);
      expect(c.customFields.list).toHaveBeenLastCalledWith({ kind: "global" });
    });
  });
});
