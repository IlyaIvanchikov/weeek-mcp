import { describe, it, expect, vi } from "vitest";
import { registerCrmLinkTools } from "../../src/tools/crm-links.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const dealId = "EcwB3DpREwmffxSP";
const organizationId = "a1f0e7ee-c748-4fdc-a197-52699622e4d6";
const contactId = "a1f0e7ee-cb63-430e-930f-f1592961439c";
const sale = { id: dealId, title: "Sale", funnelId: "OLY24hy2mC7n9D9l", statusId: "XliVA5F0gguLo4Pw", contacts: [], organizations: [], tags: [] };
const acme = { id: organizationId, name: "Acme", responsibleId: null, addresses: [{ id: "ad1", value: "Kazan" }], emails: [{ id: "em1", value: "kot@gmail.com" }], phones: [], contacts: [], tags: [] };
const ann = { id: contactId, firstName: "Ann", middleName: null, lastName: "Lee", name: "Ann Lee", organizations: [], emails: [], phones: [{ id: "ph1", value: "+7 911" }], tags: [] };
const ok = { success: true };
const client = () => ({
  tags: { list: vi.fn(async () => [{ id: 5, title: "VIP", color: "#f00" }]) },
  crm: {
    deals: { get: vi.fn(async () => sale), tryGet: vi.fn(async (id: string) => (id === dealId ? sale : null)), addContact: vi.fn(async () => ok), removeContact: vi.fn(async () => ok), addTag: vi.fn(async () => ok), removeTag: vi.fn(async () => ok) },
    organizations: { list: vi.fn(async () => ({ organizations: [acme], hasMore: false })), get: vi.fn(async () => acme), tryGet: vi.fn(async (id: string) => (id === organizationId ? acme : null)), addContact: vi.fn(async () => ok), removeContact: vi.fn(async () => ok), addTag: vi.fn(async () => ok), removeTag: vi.fn(async () => ok) },
    contacts: { list: vi.fn(async () => ({ contacts: [ann], hasMore: false })), get: vi.fn(async () => ann), tryGet: vi.fn(async (id: string) => (id === contactId ? ann : null)), addTag: vi.fn(async () => ok), removeTag: vi.fn(async () => ok) },
    details: { add: vi.fn(async () => ({ id: "d9", value: "x" })), update: vi.fn(async () => ({ id: "em1", value: "y" })), remove: vi.fn(async () => ok) },
  },
});
const harness = () => { const c = client(); return { c, h: toolHarness(registerCrmLinkTools, c) }; };

describe("crm link tools", () => {
  it("weeek_attach_contact links a contact to a deal or to an organization, and needs exactly one of them", async () => {
    const { c, h } = harness();
    expect(reply(await h.call("weeek_attach_contact", { contact: "Ann Lee", deal: dealId }))).toEqual(sale);
    expect(c.crm.deals.addContact).toHaveBeenCalledWith({ dealId, contactId });
    expect(reply(await h.call("weeek_attach_contact", { contact: contactId, organization: "Acme" }))).toEqual(acme);
    expect(c.crm.organizations.addContact).toHaveBeenCalledWith({ organizationId, contactId });
    expect(reply(await h.call("weeek_attach_contact", { contact: contactId })).error).toMatch(/exactly one of deal or organization/);
    expect(reply(await h.call("weeek_attach_contact", { contact: contactId, deal: dealId, organization: organizationId })).error).toMatch(/exactly one of deal or organization/);
  });
  it("weeek_detach_contact needs confirm:true", async () => {
    const { c, h } = harness();
    expect(() => h.call("weeek_detach_contact", { contact: contactId, deal: dealId })).toThrow(/confirm/);
    await h.call("weeek_detach_contact", { contact: contactId, deal: dealId, confirm: true });
    expect(c.crm.deals.removeContact).toHaveBeenCalledWith({ dealId, contactId });
  });
  it("crm tags resolve the tag by title and the owner by kind", async () => {
    const { c, h } = harness();
    await h.call("weeek_add_crm_tag", { tag: "VIP", deal: dealId });
    expect(c.crm.deals.addTag).toHaveBeenCalledWith({ dealId, tagId: 5 });
    await h.call("weeek_add_crm_tag", { tag: 5, contact: "Ann Lee" });
    expect(c.crm.contacts.addTag).toHaveBeenCalledWith({ contactId, tagId: 5 });
    expect(() => h.call("weeek_remove_crm_tag", { tag: 5, organization: organizationId })).toThrow(/confirm/);
    await h.call("weeek_remove_crm_tag", { tag: 5, organization: organizationId, confirm: true });
    expect(c.crm.organizations.removeTag).toHaveBeenCalledWith({ organizationId, tagId: 5 });
    expect(reply(await h.call("weeek_add_crm_tag", { tag: 5 })).error).toMatch(/exactly one of deal, organization or contact/);
  });
  it("weeek_add_detail posts the value to the owner, and refuses an address on a contact before any call", async () => {
    const { c, h } = harness();
    await h.call("weeek_add_detail", { organization: "Acme", kind: "phone", value: "+7 912" });
    expect(c.crm.details.add).toHaveBeenCalledWith({ owner: { kind: "organization", id: organizationId }, kind: "phone", value: "+7 912" });
    const res = await h.call("weeek_add_detail", { contact: contactId, kind: "address", value: "x" });
    expect(reply(res).error).toMatch(/a contact has no addresses/);
    expect(c.crm.details.add).toHaveBeenCalledTimes(1);
    expect(c.crm.contacts.tryGet).not.toHaveBeenCalled();
  });
  it("weeek_update_detail and weeek_delete_detail find the detail by its value or id from the owner's list", async () => {
    const { c, h } = harness();
    await h.call("weeek_update_detail", { organization: organizationId, kind: "email", detail: "kot@gmail.com", value: "y" });
    expect(c.crm.details.update).toHaveBeenCalledWith({ owner: { kind: "organization", id: organizationId }, kind: "email", detailId: "em1", value: "y" });
    expect(() => h.call("weeek_delete_detail", { contact: contactId, kind: "phone", detail: "ph1" })).toThrow(/confirm/);
    await h.call("weeek_delete_detail", { contact: contactId, kind: "phone", detail: "ph1", confirm: true });
    expect(c.crm.details.remove).toHaveBeenCalledWith({ owner: { kind: "contact", id: contactId }, kind: "phone", detailId: "ph1" });
    const res = await h.call("weeek_delete_detail", { organization: organizationId, kind: "email", detail: "nobody@x.y", confirm: true });
    expect(reply(res).error).toMatch(/could not resolve email of Acme "nobody@x.y"; candidates: none/);
    expect(c.crm.details.remove).toHaveBeenCalledTimes(1);
  });
});
