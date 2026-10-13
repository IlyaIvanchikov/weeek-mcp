import { describe, it, expect } from "vitest";
import { BoardsApi } from "../../src/api/boards.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

describe("BoardsApi", () => {
  it("list GETs /tm/boards?projectId=…", async () => {
    const f = jsonFetch(200, { success: true, boards: [{ id: 10, name: "Main" }] });
    expect(await new BoardsApi(httpWith(f)).list(2)).toEqual([{ id: 10, name: "Main" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/boards?projectId=2");
  });
});
