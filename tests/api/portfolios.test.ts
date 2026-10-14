import { describe, it, expect } from "vitest";
import { PortfoliosApi } from "../../src/api/portfolios.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const portfolio = { id: 7, name: "Clients", parentId: null, isPrivate: false };
const base = "https://api.weeek.net/public/v1/tm/portfolios";

describe("PortfoliosApi", () => {
  it("list GETs /tm/portfolios with the search query and returns the page", async () => {
    const f = jsonFetch(200, { success: true, data: [portfolio], hasMore: false });
    expect(await new PortfoliosApi(httpWith(f)).list({ search: "cli", limit: 50 })).toEqual({ portfolios: [portfolio], hasMore: false });
    expect(sent(f).url).toBe(`${base}?search=cli&limit=50`);
  });

  it("list without a query sends none", async () => {
    const f = jsonFetch(200, { success: true, data: [], hasMore: false });
    await new PortfoliosApi(httpWith(f)).list();
    expect(sent(f).url).toBe(base);
  });

  it("get GETs /tm/portfolios/{id}", async () => {
    const f = jsonFetch(200, { success: true, data: portfolio });
    expect(await new PortfoliosApi(httpWith(f)).get(7)).toEqual(portfolio);
    expect(sent(f).url).toBe(`${base}/7`);
  });

  it("create POSTs the name and the parent only when given", async () => {
    const f = jsonFetch(200, { success: true, data: portfolio });
    expect(await new PortfoliosApi(httpWith(f)).create({ name: "Clients", parentId: 3 })).toEqual(portfolio);
    expect(sent(f).json()).toEqual({ name: "Clients", parentId: 3 });
    const g = jsonFetch(200, { success: true, data: portfolio });
    await new PortfoliosApi(httpWith(g)).create({ name: "Clients" });
    expect(sent(g).json()).toEqual({ name: "Clients" });
  });

  it("update PUTs the name and returns the portfolio", async () => {
    const f = jsonFetch(200, { success: true, data: portfolio });
    expect(await new PortfoliosApi(httpWith(f)).update({ portfolioId: 7, name: "Clients" })).toEqual(portfolio);
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/7`);
    expect(sent(f).json()).toEqual({ name: "Clients" });
  });

  it("remove DELETEs the portfolio", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new PortfoliosApi(httpWith(f)).remove(7)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/7`);
  });

  it("list forwards parentId and offset and reports hasMore", async () => {
    const f = jsonFetch(200, { success: true, data: [portfolio], hasMore: true });
    const page = await new PortfoliosApi(httpWith(f)).list({ parentId: 3, limit: 1, offset: 5 });
    expect(page.hasMore).toBe(true);
    expect(sent(f).url).toBe(`${base}?parentId=3&limit=1&offset=5`);
  });
});
