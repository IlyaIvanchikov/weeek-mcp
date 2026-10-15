import { describe, it, expect, vi } from "vitest";
import { registerFunnelTools } from "../../src/tools/funnels.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const funnelId = "OLY24hy2mC7n9D9l";
const statusId = "XliVA5F0gguLo4Pw";
const sales = { id: funnelId, name: "Sales", currencyId: 1, isPrivate: false, dealsCount: 0, dealsAmount: 0, team: [], customFields: [] };
const fresh = { id: statusId, name: "New", dealsCount: 0, dealsAmount: 0 };
const usd = { id: 2, name: "US Dollar", code: "USD", symbol: "$" };
const ok = { success: true };
const client = () => ({
  customFields: { list: vi.fn(async () => []) },
  crm: {
    funnels: { list: vi.fn(async () => [sales]), get: vi.fn(async () => sales), create: vi.fn(async () => sales), update: vi.fn(async () => sales), remove: vi.fn(async () => ok) },
    statuses: { list: vi.fn(async (_fid: string) => [fresh]), get: vi.fn(async () => fresh), tryGet: vi.fn(async (id: string) => (id === statusId ? fresh : null)), create: vi.fn(async () => fresh), update: vi.fn(async () => fresh), remove: vi.fn(async () => ok) },
    currencies: { list: vi.fn(async () => [usd]) },
  },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerFunnelTools, c) }; };

describe("funnel, status and currency tools", () => {
  it("weeek_list_funnels, weeek_get_funnel (by name) and weeek_list_currencies read", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_funnels", {}))).toEqual([sales]);
    expect(reply(await h.call("weeek_get_funnel", { funnel: "sales" }))).toEqual(sales);
    expect(c.crm.funnels.get).toHaveBeenCalledWith(funnelId);
    expect(reply(await h.call("weeek_list_currencies", {}))).toEqual([usd]);
  });

  it("weeek_create_funnel resolves the currency by code and sends private as given", async () => {
    const { c, h } = harness();
    await h.call("weeek_create_funnel", { name: "Sales", currency: "usd", private: true });
    expect(c.crm.funnels.create).toHaveBeenCalledWith({ name: "Sales", currencyId: 2, isPrivate: true });
    await h.call("weeek_create_funnel", { name: "Sales" });
    expect(c.crm.funnels.create).toHaveBeenLastCalledWith({ name: "Sales", currencyId: undefined, isPrivate: false });
  });

  it("weeek_update_funnel merges over the current funnel", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_funnel", { funnel: "Sales", currency: 3 });
    expect(c.crm.funnels.update).toHaveBeenCalledWith({ funnelId, update: { name: "Sales", currencyId: 3, isPrivate: false } });
  });

  it("weeek_update_funnel builds the PUT body from a fresh read, not the cached list entry", async () => {
    const { c, h } = harness();
    const renamed = { ...sales, name: "Sales (renamed)", isPrivate: true };
    c.crm.funnels.get.mockResolvedValueOnce(renamed);
    await h.call("weeek_update_funnel", { funnel: "Sales", currency: 3 });
    expect(c.crm.funnels.get).toHaveBeenCalledWith(funnelId);
    expect(c.crm.funnels.update).toHaveBeenCalledWith({ funnelId, update: { name: renamed.name, currencyId: 3, isPrivate: true } });
  });

  it("weeek_delete_funnel needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_funnel", { funnel: funnelId })).toThrow(/confirm/);
    await h.call("weeek_delete_funnel", { funnel: funnelId, confirm: true });
    expect(c.crm.funnels.remove).toHaveBeenCalledWith(funnelId);
  });

  it("weeek_delete_funnel forgets the funnel's cached custom fields", async () => {
    const { c, h } = harness();
    const fieldScope = { kind: "funnel", funnelId } as const;
    await h.resolver.list({ kind: "customField", scope: { fieldScope } });
    await h.call("weeek_delete_funnel", { funnel: funnelId, confirm: true });
    await h.resolver.list({ kind: "customField", scope: { fieldScope } });
    expect(c.customFields.list).toHaveBeenCalledTimes(2);
  });

  it("status tools take a status id alone, or a name with its funnel", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_statuses", { funnel: "Sales" }))).toEqual([fresh]);
    expect(c.crm.statuses.list).toHaveBeenCalledWith(funnelId);
    await h.call("weeek_get_status", { status: "new", funnel: "Sales" });
    expect(c.crm.statuses.get).toHaveBeenCalledWith(statusId);
    await h.call("weeek_create_status", { funnel: "Sales", name: "Won" });
    expect(c.crm.statuses.create).toHaveBeenCalledWith({ funnelId, name: "Won" });
    await h.call("weeek_update_status", { status: statusId, name: "Open" });
    expect(c.crm.statuses.update).toHaveBeenCalledWith({ statusId, name: "Open" });
    const res = await h.call("weeek_update_status", { status: "New", name: "Open" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/needs a funnel \(name or id\)/);
  });

  it("weeek_delete_status needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_status", { status: statusId })).toThrow(/confirm/);
    await h.call("weeek_delete_status", { status: statusId, confirm: true });
    expect(c.crm.statuses.remove).toHaveBeenCalledWith(statusId);
  });

  it("funnel and status writes forget their cached names", async () => {
    const { c, h } = harness();
    await h.call("weeek_get_funnel", { funnel: "Sales" });
    await h.call("weeek_update_funnel", { funnel: "Sales", name: "Sales 2" });
    await h.call("weeek_get_funnel", { funnel: "Sales" });
    expect(c.crm.funnels.list).toHaveBeenCalledTimes(2);
    await h.call("weeek_get_status", { status: "New", funnel: funnelId });
    await h.call("weeek_create_status", { funnel: funnelId, name: "Won" });
    await h.call("weeek_get_status", { status: "New", funnel: funnelId });
    expect(c.crm.statuses.list).toHaveBeenCalledTimes(2);
  });
});
