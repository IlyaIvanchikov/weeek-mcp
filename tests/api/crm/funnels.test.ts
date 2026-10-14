import { describe, it, expect } from "vitest";
import { FunnelsApi } from "../../../src/api/crm/funnels.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

const rawFunnel = { id: "OLY24hy2mC7n9D9l", name: "Sales", dealsCount: 3, customFields: [{ id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Source", type: "text", options: [] }] };

describe("FunnelsApi", () => {
  it("list GETs /crm/funnels and keeps id, name and fields", async () => {
    const f = jsonFetch(200, { success: true, funnels: [rawFunnel] });
    expect(await new FunnelsApi(httpWith(f)).list()).toEqual([{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [{ id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Source", type: "text", config: null, options: [] }] }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/crm/funnels");
  });
});
