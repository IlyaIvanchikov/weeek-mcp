import { describe, it, expect } from "vitest";
import { DetailsApi } from "../../../src/api/crm/details.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const base = "https://api.weeek.net/public/v1/crm";
const organization = { kind: "organization", id: "a1f0e7ee-c748-4fdc-a197-52699622e4d6" } as const;
const contact = { kind: "contact", id: "a1f0e7ee-cb63-430e-930f-f1592961439c" } as const;
const api = (f: ReturnType<typeof jsonFetch>) => new DetailsApi(httpWith(f));

describe("DetailsApi", () => {
  it.each([
    [organization, "address", `${base}/organizations/${organization.id}/addresses`, { address: "Kazan" }],
    [organization, "email", `${base}/organizations/${organization.id}/emails`, { email: "kot@gmail.com" }],
    [organization, "phone", `${base}/organizations/${organization.id}/phones`, { phone: "+7 911" }],
    [contact, "email", `${base}/contacts/${contact.id}/emails`, { email: "kot@gmail.com" }],
    [contact, "phone", `${base}/contacts/${contact.id}/phones`, { phone: "+7 911" }],
  ] as const)("add POSTs %s %s to its route", async (owner, kind, url, body) => {
    const value = Object.values(body)[0];
    const f = jsonFetch(200, { success: true, [kind]: { id: "d1", [kind]: value } });
    expect(await api(f).add({ owner, kind, value })).toEqual({ id: "d1", value });
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(url);
    expect(sent(f).json()).toEqual(body);
  });
  it("update PUTs the value to the detail's path and remove DELETEs it", async () => {
    const f = jsonFetch(200, { success: true, phone: { id: "ph1", phone: "+7 912" } });
    expect(await api(f).update({ owner: contact, kind: "phone", detailId: "ph1", value: "+7 912" })).toEqual({ id: "ph1", value: "+7 912" });
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/contacts/${contact.id}/phones/ph1`);
    expect(sent(f).json()).toEqual({ phone: "+7 912" });
    const g = jsonFetch(200, { success: true });
    expect(await api(g).remove({ owner: organization, kind: "address", detailId: "ad1" })).toEqual({ success: true });
    expect(sent(g).init.method).toBe("DELETE");
    expect(sent(g).url).toBe(`${base}/organizations/${organization.id}/addresses/ad1`);
  });
  it("refuses an address on a contact before any request", async () => {
    const f = jsonFetch(200, { success: true });
    await expect(api(f).add({ owner: contact, kind: "address", value: "x" })).rejects.toThrow(/a contact has no addresses/);
    expect(f).not.toHaveBeenCalled();
  });
});
