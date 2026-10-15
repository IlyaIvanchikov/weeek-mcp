import { describe, it, expect, vi } from "vitest";
import { registerDealTools } from "../../src/tools/deals.js";
import { toolHarness, reply, stubMembers } from "../helpers/tool-harness.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  realpath: vi.fn(async (p: string) => String(p)),
  stat: vi.fn(async () => ({ isFile: () => true, size: 3 })),
}));

const funnelId = "OLY24hy2mC7n9D9l";
const statusNew = { id: "XliVA5F0gguLo4Pw", name: "New", dealsCount: 1, dealsAmount: 0 };
const statusWork = { id: "31bGWcEZ99LZLHqE", name: "Work", dealsCount: 0, dealsAmount: 0 };
const organizationId = "a1f0e7ee-c748-4fdc-a197-52699622e4d6";
const contactId = "a1f0e7ee-cb63-430e-930f-f1592961439c";
const [ilya, ann] = stubMembers;
const sale = { id: "EcwB3DpREwmffxSP", title: "Sale", description: null, funnelId, statusId: statusNew.id, amount: 100, outcome: null, assignees: [ilya.id], organizations: [], contacts: [], tags: [], tasks: [], customFields: [], attachments: [], createdAt: null, updatedAt: null };
const other = { ...sale, id: "qkLffuJ4sQ1I8W7b", title: "Other" };
const stage = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [{ id: "o1", name: "Hot", color: "red" }] };
const ok = { success: true };
const client = () => ({
  workspace: { listMembers: vi.fn(async () => stubMembers) },
  tags: { list: vi.fn(async () => [{ id: 5, title: "VIP", color: "#f00" }]) },
  customFields: { list: vi.fn(async () => [stage]) },
  crm: {
    funnels: { list: vi.fn(async () => [{ id: funnelId, name: "Sales", customFields: [stage] }]) },
    statuses: { list: vi.fn(async (_fid: string) => [statusNew, statusWork]), tryGet: vi.fn(async (id: string) => [statusNew, statusWork].find((status) => status.id === id) ?? null) },
    deals: {
      list: vi.fn(async ({ statusId }: { statusId: string }) => ({ deals: statusId === statusNew.id ? [sale, other] : [], hasMore: statusId === statusNew.id })),
      get: vi.fn(async () => sale), tryGet: vi.fn(async (id: string) => (id === sale.id ? sale : null)),
      create: vi.fn(async () => sale), update: vi.fn(async () => sale), remove: vi.fn(async () => ok),
      move: vi.fn(async () => ok), setFunnel: vi.fn(async () => ok), setStatus: vi.fn(async () => ok),
      addAssignee: vi.fn(async () => ok), removeAssignee: vi.fn(async () => ok),
      addOrganization: vi.fn(async () => ok), removeOrganization: vi.fn(async () => ok),
      addTask: vi.fn(async () => ({ id: 78, title: "Call" })), moveTask: vi.fn(async () => ok), removeTask: vi.fn(async () => ok),
      uploadAttachment: vi.fn(async () => []),
    },
    organizations: { list: vi.fn(async () => ({ organizations: [{ id: organizationId, name: "Acme" }], hasMore: false })), tryGet: vi.fn(async () => null) },
    contacts: { list: vi.fn(async () => ({ contacts: [{ id: contactId, name: "Ann Lee" }], hasMore: false })), tryGet: vi.fn(async () => null) },
  },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerDealTools, c, { attachPolicy: { attachDir: "/allowed", maxBytes: 1000 } }) }; };

describe("deal tools", () => {
  it("weeek_list_deals lists one status, or every status of a funnel, and needs one of the two", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_deals", { status: statusNew.id, search: "sa", sort: "amount", limit: 10 }))).toEqual({ deals: [sale, other], hasMore: true });
    expect(c.crm.deals.list).toHaveBeenCalledWith({ statusId: statusNew.id, query: { search: "sa", sort: "amount", limit: 10, offset: 0 } });
    expect(reply(await h.call("weeek_list_deals", { funnel: "Sales" }))).toEqual({ deals: [sale, other], hasMore: true });
    expect(c.crm.deals.list).toHaveBeenCalledTimes(3);
    const res = await h.call("weeek_list_deals", {});
    expect(reply(res).error).toMatch(/pass a status or a funnel/);
  });

  it("weeek_get_deal takes an id alone, or a title with its funnel or status", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_get_deal", { deal: sale.id }))).toEqual(sale);
    expect(c.crm.deals.tryGet).toHaveBeenCalledWith(sale.id);
    await h.call("weeek_get_deal", { deal: "sale", status: "new", funnel: "Sales" });
    expect(c.crm.deals.get).toHaveBeenLastCalledWith(sale.id);
    const res = await h.call("weeek_get_deal", { deal: "Sale" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/needs a funnel or a status \(name or id\)/);
  });

  it("weeek_create_deal resolves the status, members, organizations, contacts, tags and funnel fields", async () => {
    const { c, h } = harness();
    await h.call("weeek_create_deal", { status: "New", funnel: "Sales", title: "Big", amount: 5, outcome: "won", assignees: ["Ann"], organizations: ["Acme"], contacts: ["Ann Lee"], tags: ["VIP"], fields: { Stage: "Hot" } });
    expect(c.crm.deals.create).toHaveBeenCalledWith({ statusId: statusNew.id, deal: { title: "Big", amount: 5, outcome: "won", description: undefined, assignees: [ann.id], organizations: [organizationId], contacts: [contactId], tags: [5], customFields: { [stage.id]: "o1" } } });
    expect(c.customFields.list).toHaveBeenCalledWith({ kind: "funnel", funnelId });
  });

  it("weeek_create_deal with fields but no funnel fails before any call", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_create_deal", { status: statusNew.id, title: "Big", fields: { Stage: "Hot" } });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/fields on a new deal need `funnel`/);
    expect(c.crm.deals.create).not.toHaveBeenCalled();
  });

  it("weeek_update_deal patches only what is given and scopes fields to the deal's funnel", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_deal", { deal: sale.id, amount: null, outcome: "lost", assignees: ["Ilya", "Ann"], fields: { Stage: "Hot" } });
    expect(c.crm.deals.update).toHaveBeenCalledWith({ dealId: sale.id, patch: { amount: null, outcome: "lost", assignees: [ilya.id, ann.id], customFields: { [stage.id]: "o1" } } });
    expect(c.customFields.list).toHaveBeenCalledWith({ kind: "funnel", funnelId });
  });

  it("weeek_delete_deal needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_deal", { deal: sale.id })).toThrow(/confirm/);
    await h.call("weeek_delete_deal", { deal: sale.id, confirm: true });
    expect(c.crm.deals.remove).toHaveBeenCalledWith(sale.id);
  });

  it("weeek_move_deal sends the one request its arguments mean", async () => {
    const { c, h } = harness();
    await h.call("weeek_move_deal", { deal: sale.id, to_status: "Work" });
    expect(c.crm.deals.setStatus).toHaveBeenCalledWith({ dealId: sale.id, statusId: statusWork.id });
    expect(c.crm.deals.move).not.toHaveBeenCalled();
    expect(c.crm.deals.setFunnel).not.toHaveBeenCalled();
    await h.call("weeek_move_deal", { deal: sale.id, to_funnel: "Sales" });
    expect(c.crm.deals.setFunnel).toHaveBeenCalledWith({ dealId: sale.id, funnelId });
    await h.call("weeek_move_deal", { deal: sale.id, to_status: "Work", after: null });
    expect(c.crm.deals.move).toHaveBeenCalledWith({ dealId: sale.id, placement: { statusId: statusWork.id, previousDealId: null } });
    await h.call("weeek_move_deal", { deal: sale.id, after: "Other" });
    expect(c.crm.deals.move).toHaveBeenLastCalledWith({ dealId: sale.id, placement: { statusId: null, previousDealId: other.id } });
    expect(c.crm.deals.setStatus).toHaveBeenCalledTimes(1);
    expect(c.crm.deals.setFunnel).toHaveBeenCalledTimes(1);
    const res = await h.call("weeek_move_deal", { deal: sale.id });
    expect(reply(res).error).toMatch(/pass to_funnel, to_status or after/);
  });

  it("weeek_move_deal with to_funnel and after needs to_status, and writes nothing without it", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_move_deal", { deal: sale.id, to_funnel: "Sales", after: "Other" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/needs `to_status`/);
    for (const write of [c.crm.deals.setFunnel, c.crm.deals.setStatus, c.crm.deals.move, c.crm.deals.list]) expect(write).not.toHaveBeenCalled();
  });

  it("weeek_move_deal across funnels looks for `after` in the target status and places it there", async () => {
    const { c, h } = harness();
    c.crm.deals.list.mockImplementation(async () => ({ deals: [sale, other], hasMore: false }));
    await h.call("weeek_move_deal", { deal: sale.id, to_funnel: "Sales", to_status: "Work", after: "Other" });
    expect(c.crm.deals.list).toHaveBeenCalledWith(expect.objectContaining({ statusId: statusWork.id }));
    expect(c.crm.deals.setFunnel).toHaveBeenCalledWith({ dealId: sale.id, funnelId });
    expect(c.crm.deals.move).toHaveBeenCalledWith({ dealId: sale.id, placement: { statusId: statusWork.id, previousDealId: other.id } });
    expect(c.crm.deals.setStatus).not.toHaveBeenCalled();
  });

  it("weeek_move_deal writes nothing when the `after` deal does not resolve", async () => {
    const { c, h } = harness();
    const res = await h.call("weeek_move_deal", { deal: sale.id, to_funnel: "Sales", to_status: "Work", after: "Nope" });
    expect(res.isError).toBe(true);
    expect(reply(res).candidates).toBeDefined();
    for (const write of [c.crm.deals.setFunnel, c.crm.deals.setStatus, c.crm.deals.move]) expect(write).not.toHaveBeenCalled();
  });

  it("assignee and organization links resolve names, call once per member, and re-read the deal", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_add_deal_assignees", { deal: sale.id, assignees: ["Ann", ilya.id] }))).toEqual(sale);
    expect(c.crm.deals.addAssignee).toHaveBeenNthCalledWith(1, { dealId: sale.id, memberId: ann.id });
    expect(c.crm.deals.addAssignee).toHaveBeenNthCalledWith(2, { dealId: sale.id, memberId: ilya.id });
    expect(() => h.call("weeek_remove_deal_assignees", { deal: sale.id, assignees: ["Ann"] })).toThrow(/confirm/);
    await h.call("weeek_remove_deal_assignees", { deal: sale.id, assignees: ["Ann"], confirm: true });
    expect(c.crm.deals.removeAssignee).toHaveBeenCalledWith({ dealId: sale.id, memberId: ann.id });
    await h.call("weeek_attach_organization", { deal: sale.id, organization: "Acme" });
    expect(c.crm.deals.addOrganization).toHaveBeenCalledWith({ dealId: sale.id, organizationId });
    expect(() => h.call("weeek_detach_organization", { deal: sale.id, organization: "Acme" })).toThrow(/confirm/);
    await h.call("weeek_detach_organization", { deal: sale.id, organization: organizationId, confirm: true });
    expect(c.crm.deals.removeOrganization).toHaveBeenCalledWith({ dealId: sale.id, organizationId });
  });

  it("deal tasks are added, moved and removed", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_add_deal_task", { deal: sale.id, title: "Call" }))).toEqual({ id: 78, title: "Call" });
    expect(c.crm.deals.addTask).toHaveBeenCalledWith({ dealId: sale.id, title: "Call", description: undefined });
    await h.call("weeek_move_deal_task", { deal: sale.id, task_id: 78, after: null });
    expect(c.crm.deals.moveTask).toHaveBeenCalledWith({ dealId: sale.id, taskId: 78, previousTaskId: null });
    expect(() => h.call("weeek_remove_deal_task", { deal: sale.id, task_id: 78 })).toThrow(/confirm/);
    await h.call("weeek_remove_deal_task", { deal: sale.id, task_id: 78, confirm: true });
    expect(c.crm.deals.removeTask).toHaveBeenCalledWith({ dealId: sale.id, taskId: 78 });
  });

  it("weeek_attach_deal_file uploads a file inside the allowed dir and refuses one outside", async () => {
    const { c, h } = harness();
    await h.call("weeek_attach_deal_file", { deal: sale.id, path: "/allowed/f.md" });
    expect(c.crm.deals.uploadAttachment).toHaveBeenCalledWith({ dealId: sale.id, filename: "f.md", bytes: new Uint8Array([1, 2, 3]) });
    const res = await h.call("weeek_attach_deal_file", { deal: sale.id, path: "/etc/passwd" });
    expect(res.isError).toBe(true);
    expect(c.crm.deals.uploadAttachment).toHaveBeenCalledTimes(1);
  });

  it("deal writes forget the cached deal searches", async () => {
    const { c, h } = harness();
    await h.call("weeek_get_deal", { deal: "Sale", status: statusNew.id });
    await h.call("weeek_update_deal", { deal: sale.id, title: "Sale 2" });
    await h.call("weeek_get_deal", { deal: "Sale", status: statusNew.id });
    expect(c.crm.deals.list).toHaveBeenCalledTimes(2);
  });
});
