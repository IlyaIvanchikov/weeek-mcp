import { describe, it, expect, vi } from "vitest";
import { registerContactTools } from "../../src/tools/contacts.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const organizationId = "a1f0e7ee-c748-4fdc-a197-52699622e4d6";
const ann = { id: "a1f0e7ee-cb63-430e-930f-f1592961439c", firstName: "Ann", middleName: null as string | null, lastName: "Lee", name: "Ann Lee", organizations: [organizationId], emails: [], phones: [{ id: "ph1", value: "+7 911" }], tags: [] };
const ok = { success: true };
const client = () => ({
  tags: { list: vi.fn(async () => [{ id: 5, title: "VIP", color: "#f00" }]) },
  crm: {
    organizations: { list: vi.fn(async () => ({ organizations: [{ id: organizationId, name: "Acme" }], hasMore: false })), tryGet: vi.fn(async () => null) },
    contacts: { list: vi.fn(async () => ({ contacts: [ann], hasMore: false })), get: vi.fn(async () => ann), tryGet: vi.fn(async (): Promise<typeof ann | null> => null), create: vi.fn(async () => ann), update: vi.fn(async () => ann), remove: vi.fn(async () => ok) },
  },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerContactTools, c) }; };

describe("contact tools", () => {
  it("weeek_list_contacts and weeek_get_contact (by full name) read", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_list_contacts", { search: "an" }))).toEqual({ contacts: [ann], hasMore: false });
    expect(c.crm.contacts.list).toHaveBeenCalledWith({ search: "an", sort: undefined, limit: 20, offset: 0 });
    expect(reply(await h.call("weeek_get_contact", { contact: "ann lee" }))).toEqual(ann);
    expect(c.crm.contacts.get).toHaveBeenCalledWith(ann.id);
  });
  it("weeek_create_contact resolves organizations and tags by name", async () => {
    const { c, h } = harness();
    await h.call("weeek_create_contact", { first_name: "Ann", last_name: "Lee", organizations: ["Acme"], tags: ["VIP"], phones: ["+7 911"] });
    expect(c.crm.contacts.create).toHaveBeenCalledWith({ firstName: "Ann", middleName: undefined, lastName: "Lee", organizations: [organizationId], emails: undefined, phones: ["+7 911"], tags: [5] });
  });
  it("weeek_update_contact merges the names over the current contact", async () => {
    const { c, h } = harness();
    c.crm.contacts.tryGet.mockResolvedValueOnce(ann);
    await h.call("weeek_update_contact", { contact: ann.id, last_name: "Li" });
    expect(c.crm.contacts.update).toHaveBeenCalledWith({ contactId: ann.id, update: { firstName: "Ann", middleName: null, lastName: "Li" } });
  });
  it("weeek_update_contact builds the PUT body from a fresh read, not the cached search entry", async () => {
    const { c, h } = harness();
    const renamed = { ...ann, firstName: "Anna", middleName: "B" };
    c.crm.contacts.get.mockResolvedValueOnce(renamed);
    await h.call("weeek_update_contact", { contact: "ann lee", last_name: "Li" });
    expect(c.crm.contacts.get).toHaveBeenCalledWith(ann.id);
    expect(c.crm.contacts.update).toHaveBeenCalledWith({ contactId: ann.id, update: { firstName: "Anna", middleName: "B", lastName: "Li" } });
  });
  it("weeek_delete_contact needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_delete_contact", { contact: ann.id })).toThrow(/confirm/);
    await h.call("weeek_delete_contact", { contact: ann.id, confirm: true });
    expect(c.crm.contacts.remove).toHaveBeenCalledWith(ann.id);
  });
});
