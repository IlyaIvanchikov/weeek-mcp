import { describe, it, expect } from "vitest";
import { OrganizationsApi } from "../../../src/api/crm/organizations.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const base = "https://api.weeek.net/public/v1/crm/organizations";
const organizationId = "a1f0e7ee-c748-4fdc-a197-52699622e4d6";
const rawOrganization = {
  id: organizationId, creatorId: "u1", name: "Acme", responsibleId: null,
  addresses: [{ id: "ad1", address: "Kazan" }], emails: [{ id: "em1", email: "kot@gmail.com" }], phones: [{ id: "ph1", phone: "+7 911" }],
  contacts: ["c1"], tags: [5], createdAt: "2026-10-01T00:00:00Z",
};
const organization = { id: organizationId, name: "Acme", responsibleId: null, addresses: [{ id: "ad1", value: "Kazan" }], emails: [{ id: "em1", value: "kot@gmail.com" }], phones: [{ id: "ph1", value: "+7 911" }], contacts: ["c1"], tags: [5] };
const api = (f: ReturnType<typeof jsonFetch>) => new OrganizationsApi(httpWith(f));

describe("OrganizationsApi", () => {
  it("list GETs /crm/organizations with the query; hasMore means a full page was asked for", async () => {
    const f = jsonFetch(200, { success: true, organizations: [rawOrganization] });
    expect(await api(f).list({ search: "ac", sort: "alphabet", limit: 1, offset: 0 })).toEqual({ organizations: [organization], hasMore: true });
    expect(sent(f).url).toBe(`${base}?search=ac&sort=alphabet&limit=1&offset=0`);
    const g = jsonFetch(200, { success: true, organizations: [rawOrganization] });
    expect((await api(g).list()).hasMore).toBe(false);
  });
  it("get GETs /crm/organizations/{id}; tryGet is null on a 404", async () => {
    const f = jsonFetch(200, { success: true, organization: rawOrganization });
    expect(await api(f).get(organizationId)).toEqual(organization);
    expect(sent(f).url).toBe(`${base}/${organizationId}`);
    expect(await api(jsonFetch(404, { message: "not found" })).tryGet(organizationId)).toBeNull();
  });
  it("create POSTs the fields given, the responsible as responsibleId", async () => {
    const f = jsonFetch(200, { success: true, organization: rawOrganization });
    expect(await api(f).create({ name: "Acme", emails: ["kot@gmail.com"], responsibleId: "u1" })).toEqual(organization);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Acme", emails: ["kot@gmail.com"], responsibleId: "u1" });
  });
  it("update PUTs name and responsibleId only — the detail arrays are kept by the API when omitted", async () => {
    const f = jsonFetch(200, { success: true, organization: rawOrganization });
    expect(await api(f).update({ organizationId, update: { name: "Acme 2", responsibleId: null } })).toEqual(organization);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/${organizationId}`);
    expect(sent(f).json()).toEqual({ name: "Acme 2", responsibleId: null });
  });
  it("remove DELETEs the organization", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).remove(organizationId)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/${organizationId}`);
  });
  it.each([
    ["addContact", "POST", "contacts", { contactId: "c2" }, { contactId: "c2" }],
    ["removeContact", "DELETE", "contacts", { contactId: "c2" }, { contactId: "c2" }],
    ["addTag", "POST", "tags", { tagId: 5 }, { tagId: 5 }],
    ["removeTag", "DELETE", "tags", { tagId: 5 }, { tagId: 5 }],
  ] as const)("%s sends %s /%s with the id", async (method, verb, segment, options, body) => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f)[method]({ organizationId, ...options } as never)).toEqual({ success: true });
    expect(sent(f).init.method).toBe(verb);
    expect(sent(f).url).toBe(`${base}/${organizationId}/${segment}`);
    expect(sent(f).json()).toEqual(body);
  });
});
