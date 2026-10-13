import { describe, it, expect } from "vitest";
import { BoardsApi } from "../../src/api/boards.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const board = { id: 10, name: "Main", projectId: 2, isPrivate: false };
const base = "https://api.weeek.net/public/v1/tm/boards";

describe("BoardsApi", () => {
  it("list GETs /tm/boards?projectId=… and normalises each board", async () => {
    const f = jsonFetch(200, { success: true, boards: [board] });
    expect(await new BoardsApi(httpWith(f)).list(2)).toEqual([board]);
    expect(sent(f).url).toBe(`${base}?projectId=2`);
  });

  it("create POSTs name + projectId and returns the board", async () => {
    const f = jsonFetch(200, { success: true, board });
    expect(await new BoardsApi(httpWith(f)).create({ name: "Main", projectId: 2 })).toEqual(board);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Main", projectId: 2 });
  });

  it("update PUTs the name", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new BoardsApi(httpWith(f)).update({ boardId: 10, name: "Renamed" })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/10`);
    expect(sent(f).json()).toEqual({ name: "Renamed" });
  });

  it("remove DELETEs the board", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new BoardsApi(httpWith(f)).remove(10)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/10`);
  });

  it("move POSTs upperBoardId, null meaning the top", async () => {
    const f = jsonFetch(200, { success: true });
    await new BoardsApi(httpWith(f)).move({ boardId: 10, upperBoardId: 9 });
    expect(sent(f).url).toBe(`${base}/10/move`);
    expect(sent(f).json()).toEqual({ upperBoardId: 9 });
    const g = jsonFetch(200, { success: true });
    await new BoardsApi(httpWith(g)).move({ boardId: 10, upperBoardId: null });
    expect(sent(g).json()).toEqual({ upperBoardId: null });
  });
});
