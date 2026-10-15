import { describe, it, expect } from "vitest";
import { ContactsApi } from "../../../src/api/crm/contacts.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const base = "https://api.weeek.net/public/v1/crm/contacts";
const contactId = "a1f0e7ee-cb63-430e-930f-f1592961439c";
const rawContact = { id: contactId, creatorId: "u1", firstName: "Ann", middleName: null, lastName: "Lee", organizations: ["o1"], emails: [{ id: "em1", email: "ann@x.y" }], phones: [], tags: [], createdAt: "2026-10-01T00:00:00Z" };
const contact = { id: contactId, firstName: "Ann", middleName: null, lastName: "Lee", name: "Ann Lee", organizations: ["o1"], emails: [{ id: "em1", value: "ann@x.y" }], phones: [], tags: [] };
const api = (f: ReturnType<typeof jsonFetch>) => new ContactsApi(httpWith(f));

describe("ContactsApi", () => {
  it("list GETs /crm/contacts with the query and joins the name", async () => {
    const f = jsonFetch(200, { success: true, contacts: [rawContact] });
    expect(await api(f).list({ search: "an", limit: 50 })).toEqual({ contacts: [contact], hasMore: false });
    expect(sent(f).url).toBe(`${base}?search=an&limit=50`);
  });
  it("get GETs /crm/contacts/{id}; tryGet is null on a 404", async () => {
    const f = jsonFetch(200, { success: true, contact: rawContact });
    expect(await api(f).get(contactId)).toEqual(contact);
    expect(sent(f).url).toBe(`${base}/${contactId}`);
    expect(await api(jsonFetch(404, { message: "not found" })).tryGet(contactId)).toBeNull();
  });
  it("create POSTs the fields given", async () => {
    const f = jsonFetch(200, { success: true, contact: rawContact });
    expect(await api(f).create({ firstName: "Ann", lastName: "Lee", organizations: ["o1"] })).toEqual(contact);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ firstName: "Ann", lastName: "Lee", organizations: ["o1"] });
  });
  it("update PUTs the three names only", async () => {
    const f = jsonFetch(200, { success: true, contact: rawContact });
    expect(await api(f).update({ contactId, update: { firstName: "Ann", middleName: null, lastName: "Li" } })).toEqual(contact);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/${contactId}`);
    expect(sent(f).json()).toEqual({ firstName: "Ann", middleName: null, lastName: "Li" });
  });
  it("remove DELETEs the contact", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).remove(contactId)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/${contactId}`);
  });
  it.each([["addTag", "POST"], ["removeTag", "DELETE"]] as const)("%s sends %s /tags with tagId", async (method, verb) => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f)[method]({ contactId, tagId: 5 })).toEqual({ success: true });
    expect(sent(f).init.method).toBe(verb);
    expect(sent(f).url).toBe(`${base}/${contactId}/tags`);
    expect(sent(f).json()).toEqual({ tagId: 5 });
  });
});
