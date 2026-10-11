import { describe, it, expect } from "vitest";
import { ColumnsApi } from "../../src/api/columns.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

describe("ColumnsApi", () => {
  it("list GETs /tm/board-columns?boardId=…", async () => {
    const f = jsonFetch(200, { success: true, boardColumns: [{ id: 100, name: "Done" }] });
    expect(await new ColumnsApi(httpWith(f)).list(10)).toEqual([{ id: 100, name: "Done" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/board-columns?boardId=10");
  });
});
