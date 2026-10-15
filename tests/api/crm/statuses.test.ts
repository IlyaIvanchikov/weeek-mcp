import { describe, it, expect } from "vitest";
import { StatusesApi } from "../../../src/api/crm/statuses.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const base = "https://api.weeek.net/public/v1/crm";
const funnelId = "OLY24hy2mC7n9D9l";
const statusId = "XliVA5F0gguLo4Pw";
const rawStatus = { id: statusId, creatorId: "u1", name: "New", dealsCount: 3, dealsAmount: 10400, createdAt: "2026-10-01T00:00:00Z" };
const status = { id: statusId, name: "New", dealsCount: 3, dealsAmount: 10400 };

describe("StatusesApi", () => {
  it("list GETs /crm/funnels/{id}/statuses and normalises each status", async () => {
    const f = jsonFetch(200, { success: true, statuses: [rawStatus] });
    expect(await new StatusesApi(httpWith(f)).list(funnelId)).toEqual([status]);
    expect(sent(f).url).toBe(`${base}/funnels/${funnelId}/statuses`);
  });
  it("get GETs /crm/statuses/{id}; tryGet is null on a 404", async () => {
    const f = jsonFetch(200, { success: true, status: rawStatus });
    expect(await new StatusesApi(httpWith(f)).get(statusId)).toEqual(status);
    expect(sent(f).url).toBe(`${base}/statuses/${statusId}`);
    expect(await new StatusesApi(httpWith(jsonFetch(404, { message: "not found" }))).tryGet(statusId)).toBeNull();
  });
  it("create POSTs the name under the funnel", async () => {
    const f = jsonFetch(200, { success: true, status: rawStatus });
    expect(await new StatusesApi(httpWith(f)).create({ funnelId, name: "New" })).toEqual(status);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).url).toBe(`${base}/funnels/${funnelId}/statuses`);
    expect(sent(f).json()).toEqual({ name: "New" });
  });
  it("update PUTs the name", async () => {
    const f = jsonFetch(200, { success: true, status: rawStatus });
    expect(await new StatusesApi(httpWith(f)).update({ statusId, name: "Open" })).toEqual(status);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/statuses/${statusId}`);
    expect(sent(f).json()).toEqual({ name: "Open" });
  });
  it("remove DELETEs the status", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new StatusesApi(httpWith(f)).remove(statusId)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/statuses/${statusId}`);
  });
});
