import { describe, it, expect } from "vitest";
import { DealsApi, toDeal } from "../../../src/api/crm/deals.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const base = "https://api.weeek.net/public/v1/crm";
const dealId = "EcwB3DpREwmffxSP";
const statusId = "XliVA5F0gguLo4Pw";
const funnelId = "OLY24hy2mC7n9D9l";
const rawDeal = {
  id: dealId, creatorId: "u1", funnelId, statusId, assignees: ["u1"], organizations: ["o1"], contacts: ["c1"],
  title: "Sale", description: null, amount: 10000, winStatus: "won", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
  tags: [5], tasks: [{ id: 78, title: "Call" }], customFields: [{ id: "f1", name: "Source", type: "text", options: [], value: "web" }], attachments: [],
};
const deal = {
  id: dealId, title: "Sale", description: null, funnelId, statusId, amount: 10000, outcome: "won",
  assignees: ["u1"], organizations: ["o1"], contacts: ["c1"], tags: [5], tasks: [78],
  customFields: [{ id: "f1", name: "Source", type: "text", value: "web" }], attachments: [],
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
};
const api = (f: ReturnType<typeof jsonFetch>) => new DealsApi(httpWith(f));

describe("toDeal", () => {
  it("reads tags sent as objects as their ids", () => {
    expect(toDeal({ ...rawDeal, tags: [{ id: 16, title: "VIP", color: "#F900EA" }] }).tags).toEqual([16]);
  });

  it("defaults missing fields and ignores an unknown outcome", () => {
    expect(toDeal({ id: dealId, winStatus: "maybe" })).toEqual({
      id: dealId, title: "", description: null, funnelId: "", statusId: "", amount: null, outcome: null,
      assignees: [], organizations: [], contacts: [], tags: [], tasks: [], customFields: [], attachments: [], createdAt: null, updatedAt: null,
    });
  });
});

describe("DealsApi", () => {
  it("list GETs the status's deals with the query and reports hasMoreDeals", async () => {
    const f = jsonFetch(200, { success: true, deals: [rawDeal], hasMoreDeals: true });
    expect(await api(f).list({ statusId, query: { search: "sa", sort: "title", limit: 50 } })).toEqual({ deals: [deal], hasMore: true });
    expect(sent(f).url).toBe(`${base}/statuses/${statusId}/deals?search=sa&sort=title&limit=50`);
  });
  it("get GETs /crm/deals/{id}; tryGet is null on a 404", async () => {
    const f = jsonFetch(200, { success: true, deal: rawDeal });
    expect(await api(f).get(dealId)).toEqual(deal);
    expect(sent(f).url).toBe(`${base}/deals/${dealId}`);
    expect(await api(jsonFetch(404, { message: "not found" })).tryGet(dealId)).toBeNull();
  });
  it("create POSTs under the status, mapping outcome to winStatus and sending only what is given", async () => {
    const f = jsonFetch(200, { success: true, deal: rawDeal });
    expect(await api(f).create({ statusId, deal: { title: "Sale", amount: 10, outcome: "won", contacts: ["c1"], customFields: { f1: "web" } } })).toEqual(deal);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(`${base}/statuses/${statusId}/deals`);
    expect(sent(f).json()).toEqual({ title: "Sale", amount: 10, winStatus: "won", contacts: ["c1"], customFields: { f1: "web" } });
  });
  it("replace PUTs the subset and returns the deal", async () => {
    const f = jsonFetch(200, { success: true, deal: rawDeal });
    expect(await api(f).replace({ dealId, replacement: { title: "Sale", outcome: null } })).toEqual(deal);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).json()).toEqual({ title: "Sale", winStatus: null });
  });
  it("update PATCHes the fields given, then re-reads the deal", async () => {
    const f = jsonFetch(200, { success: true, deal: rawDeal });
    expect(await api(f).update({ dealId, patch: { amount: null, assignees: ["u1", "u2"] } })).toEqual(deal);
    expect(sent(f, 0).init.method).toBe("PATCH");
    expect(sent(f, 0).url).toBe(`${base}/deals/${dealId}`);
    expect(sent(f, 0).json()).toEqual({ amount: null, assignees: ["u1", "u2"] });
    expect(sent(f, 1).url).toBe(`${base}/deals/${dealId}`);
  });
  it("remove DELETEs the deal", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f).remove(dealId)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/deals/${dealId}`);
  });
  it("move, setFunnel and setStatus send their bodies", async () => {
    const f = jsonFetch(200, { success: true });
    await api(f).move({ dealId, placement: { statusId, previousDealId: null } });
    expect(sent(f).url).toBe(`${base}/deals/${dealId}/move`);
    expect(sent(f).json()).toEqual({ statusId, previousDealId: null });
    const g = jsonFetch(200, { success: true });
    await api(g).setFunnel({ dealId, funnelId });
    expect(sent(g).init.method).toBe("PUT");
    expect(sent(g).url).toBe(`${base}/deals/${dealId}/funnel`);
    expect(sent(g).json()).toEqual({ funnelId });
    const h = jsonFetch(200, { success: true });
    await api(h).setStatus({ dealId, statusId });
    expect(sent(h).url).toBe(`${base}/deals/${dealId}/status`);
    expect(sent(h).json()).toEqual({ statusId });
  });
  it.each([
    ["addAssignee", "POST", "assignees", { memberId: "u2" }, { assigneeId: "u2" }],
    ["removeAssignee", "DELETE", "assignees", { memberId: "u2" }, { assigneeId: "u2" }],
    ["addContact", "POST", "contacts", { contactId: "c2" }, { contactId: "c2" }],
    ["removeContact", "DELETE", "contacts", { contactId: "c2" }, { contactId: "c2" }],
    ["addOrganization", "POST", "organizations", { organizationId: "o2" }, { organizationId: "o2" }],
    ["removeOrganization", "DELETE", "organizations", { organizationId: "o2" }, { organizationId: "o2" }],
    ["addTag", "POST", "tags", { tagId: 5 }, { tag: 5 }],
    ["removeTag", "DELETE", "tags", { tagId: 5 }, { tag: 5 }],
  ] as const)("%s sends %s /%s with the id", async (method, verb, segment, options, body) => {
    const f = jsonFetch(200, { success: true });
    expect(await api(f)[method]({ dealId, ...options } as never)).toEqual({ success: true });
    expect(sent(f).init.method).toBe(verb);
    expect(sent(f).url).toBe(`${base}/deals/${dealId}/${segment}`);
    expect(sent(f).json()).toEqual(body);
  });
  it("addTask POSTs the title and returns the task; moveTask and removeTask address the task", async () => {
    const f = jsonFetch(200, { success: true, task: { id: 78, title: "Call" } });
    expect((await api(f).addTask({ dealId, title: "Call" })).id).toBe(78);
    expect(sent(f).url).toBe(`${base}/deals/${dealId}/tasks`);
    expect(sent(f).json()).toEqual({ title: "Call" });
    const g = jsonFetch(200, { success: true });
    await api(g).moveTask({ dealId, taskId: 78, previousTaskId: null });
    expect(sent(g).url).toBe(`${base}/deals/${dealId}/tasks/78/move`);
    expect(sent(g).json()).toEqual({ previousTaskId: null });
    const h = jsonFetch(200, { success: true });
    await api(h).removeTask({ dealId, taskId: 78 });
    expect(sent(h).init.method).toBe("DELETE");
    expect(sent(h).url).toBe(`${base}/deals/${dealId}/tasks/78`);
  });
  it("uploadAttachment posts multipart files[] and returns the attachments as a list", async () => {
    const att = { id: "a1", creatorId: "u1", service: "weeek", name: "f.md", url: "http://x", size: 3, createdAt: "2026-08-01T10:00:00Z" };
    const f = jsonFetch(200, { success: true, data: att });
    expect(await api(f).uploadAttachment({ dealId, filename: "f.md", bytes: new Uint8Array([1, 2, 3]) })).toEqual([att]);
    expect(sent(f).url).toBe(`${base}/deals/${dealId}/attachments`);
    expect(sent(f).init.body).toBeInstanceOf(FormData);
    expect(sent(f).init.headers).not.toHaveProperty("content-type");
  });
});
