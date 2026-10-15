import { describe, it, expect, vi } from "vitest";
import { registerOrganizationTools } from "../../src/tools/organizations.js";
import { toolHarness, reply, stubMembers } from "../helpers/tool-harness.js";

const [ilya, ann] = stubMembers;
const acme = { id: "a1f0e7ee-c748-4fdc-a197-52699622e4d6", name: "Acme", responsibleId: ilya.id, addresses: [], emails: [{ id: "em1", value: "kot@gmail.com" }], phones: [], contacts: [], tags: [] };
const ok = { success: true };
const client = () => ({
  workspace: { listMembers: vi.fn(async () => stubMembers) },
  crm: { organizations: { list: vi.fn(async () => ({ organizations: [acme], hasMore: false })), get: vi.fn(async () => acme), tryGet: vi.fn(async (): Promise<typeof acme | null> => null), create: vi.fn(async () => acme), update: vi.fn(async () => acme), remove: vi.fn(async () => ok) } },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerOrganizationTools, c) }; };

describe("organization tools", () => {
  it("weeek_list_organizations forwards search, sort and paging", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_organizations", { search: "ac", sort: "alphabet", limit: 10 }))).toEqual({ organizations: [acme], hasMore: false });
    expect(c.crm.organizations.list).toHaveBeenCalledWith({ search: "ac", sort: "alphabet", limit: 10, offset: 0 });
  });
  it("weeek_get_organization resolves the name through the search", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_get_organization", { organization: "acme" }))).toEqual(acme);
    expect(c.crm.organizations.list).toHaveBeenCalledWith({ search: "acme", limit: 50 });
    expect(c.crm.organizations.get).toHaveBeenCalledWith(acme.id);
  });
  it("weeek_create_organization resolves responsibles by name and sends the details as given", async () => {
    const { c, h } = harness();
    await h.call("weeek_create_organization", { name: "Acme", emails: ["kot@gmail.com"], responsibles: ["Ann"] });
    expect(c.crm.organizations.create).toHaveBeenCalledWith({ name: "Acme", addresses: undefined, emails: ["kot@gmail.com"], phones: undefined, responsibles: [ann.id] });
  });
  it("weeek_update_organization keeps the current name and responsible and never sends the detail arrays", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_organization", { organization: acme.id, responsibles: ["Ann"] });
    expect(c.crm.organizations.update).toHaveBeenCalledWith({ organizationId: acme.id, update: { name: "Acme", responsibles: [ann.id] } });
    c.crm.organizations.tryGet.mockResolvedValueOnce(acme);
    await h.call("weeek_update_organization", { organization: acme.id, name: "Acme 2" });
    expect(c.crm.organizations.update).toHaveBeenLastCalledWith({ organizationId: acme.id, update: { name: "Acme 2", responsibles: [ilya.id] } });
  });
  it("weeek_delete_organization needs confirm:true and forgets the cached searches", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_organization", { organization: acme.id })).toThrow(/confirm/);
    await h.call("weeek_get_organization", { organization: "Acme" });
    await h.call("weeek_delete_organization", { organization: acme.id, confirm: true });
    expect(c.crm.organizations.remove).toHaveBeenCalledWith(acme.id);
    await h.call("weeek_get_organization", { organization: "Acme" });
    expect(c.crm.organizations.list).toHaveBeenCalledTimes(2);
  });
});
