import { describe, it, expect } from "vitest";
import { ColumnsApi } from "../../src/api/columns.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const column = { id: 100, name: "Done", boardId: 10 };
const base = "https://api.weeek.net/public/v1/tm/board-columns";

describe("ColumnsApi", () => {
  it("list GETs /tm/board-columns?boardId=… and normalises each column", async () => {
    const f = jsonFetch(200, { success: true, boardColumns: [column] });
    expect(await new ColumnsApi(httpWith(f)).list(10)).toEqual([column]);
    expect(sent(f).url).toBe(`${base}?boardId=10`);
  });

  it("create POSTs name + boardId and returns the column", async () => {
    const f = jsonFetch(200, { success: true, boardColumn: column });
    expect(await new ColumnsApi(httpWith(f)).create({ name: "Done", boardId: 10 })).toEqual(column);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Done", boardId: 10 });
  });

  it("update PUTs the name", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new ColumnsApi(httpWith(f)).update({ columnId: 100, name: "Shipped" })).toEqual({ success: true });
    expect(sent(f).init.method).toBe("PUT");
    expect(sent(f).url).toBe(`${base}/100`);
    expect(sent(f).json()).toEqual({ name: "Shipped" });
  });

  it("remove DELETEs the column", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new ColumnsApi(httpWith(f)).remove(100)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/100`);
  });

  it("move POSTs upperBoardColumnId, null meaning the first position", async () => {
    const f = jsonFetch(200, { success: true });
    await new ColumnsApi(httpWith(f)).move({ columnId: 100, upperColumnId: 99 });
    expect(sent(f).url).toBe(`${base}/100/move`);
    expect(sent(f).json()).toEqual({ upperBoardColumnId: 99 });
    const g = jsonFetch(200, { success: true });
    await new ColumnsApi(httpWith(g)).move({ columnId: 100, upperColumnId: null });
    expect(sent(g).json()).toEqual({ upperBoardColumnId: null });
  });

  it("list coerces ids and defaults a missing name", async () => {
    const f = jsonFetch(200, { success: true, boardColumns: [{ id: "100", boardId: "10" }] });
    expect(await new ColumnsApi(httpWith(f)).list(10)).toEqual([{ id: 100, name: "", boardId: 10 }]);
  });
});
