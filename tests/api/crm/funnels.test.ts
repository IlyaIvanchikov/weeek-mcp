import { describe, it, expect } from "vitest";
import { FunnelsApi, toFunnel } from "../../../src/api/crm/funnels.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const base = "https://api.weeek.net/public/v1/crm/funnels";
const funnelId = "OLY24hy2mC7n9D9l";
const rawFunnel = { id: funnelId, name: "Sales", currencyId: 1, isPrivate: false, dealsCount: 3, dealsAmount: 10400, team: ["u1"], customFields: [{ id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Source", type: "text", options: [] }], logo: null };
const funnel = { id: funnelId, name: "Sales", currencyId: 1, isPrivate: false, dealsCount: 3, dealsAmount: 10400, team: ["u1"], customFields: [{ id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Source", type: "text", config: null, options: [] }] };

describe("FunnelsApi", () => {
  it("list GETs /crm/funnels and normalises each funnel", async () => {
    const f = jsonFetch(200, { success: true, funnels: [rawFunnel] });
    expect(await new FunnelsApi(httpWith(f)).list()).toEqual([funnel]);
    expect(sent(f).url).toBe(base);
  });
  it("toFunnel defaults missing fields", () => {
    expect(toFunnel({ id: funnelId })).toEqual({ id: funnelId, name: "", currencyId: null, isPrivate: false, dealsCount: 0, dealsAmount: 0, team: [], customFields: [] });
  });
  it("get GETs /crm/funnels/{id}", async () => {
    const f = jsonFetch(200, { success: true, funnel: rawFunnel });
    expect(await new FunnelsApi(httpWith(f)).get(funnelId)).toEqual(funnel);
    expect(sent(f).url).toBe(`${base}/${funnelId}`);
  });
  it("create POSTs name, currency and isPrivate as 0/1", async () => {
    const f = jsonFetch(200, { success: true, funnel: rawFunnel });
    expect(await new FunnelsApi(httpWith(f)).create({ name: "Sales", currencyId: 2, isPrivate: true })).toEqual(funnel);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Sales", currencyId: 2, isPrivate: 1 });
    const g = jsonFetch(200, { success: true, funnel: rawFunnel });
    await new FunnelsApi(httpWith(g)).create({ name: "Sales", isPrivate: false });
    expect(sent(g).json()).toEqual({ name: "Sales", isPrivate: 0 });
  });
  it("update PUTs the replacement and returns the funnel", async () => {
    const f = jsonFetch(200, { success: true, funnel: rawFunnel });
    expect(await new FunnelsApi(httpWith(f)).update({ funnelId, update: { name: "Sales 2", currencyId: null, isPrivate: false } })).toEqual(funnel);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/${funnelId}`);
    expect(sent(f).json()).toEqual({ name: "Sales 2", currencyId: null, isPrivate: 0 });
  });
  it("remove DELETEs the funnel", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new FunnelsApi(httpWith(f)).remove(funnelId)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/${funnelId}`);
  });
});
