import { describe, it, expect } from "vitest";
import { CurrenciesApi } from "../../../src/api/crm/currencies.js";
import { jsonFetch, httpWith, sent } from "../../helpers/http.js";

describe("CurrenciesApi", () => {
  it("list GETs /crm/currencies and normalises each currency", async () => {
    const f = jsonFetch(200, { success: true, currencies: [{ id: 2, name: "US Dollar", code: "USD", symbol: "$" }] });
    expect(await new CurrenciesApi(httpWith(f)).list()).toEqual([{ id: 2, name: "US Dollar", code: "USD", symbol: "$" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/crm/currencies");
  });
});
