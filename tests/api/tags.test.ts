import { describe, it, expect } from "vitest";
import { TagsApi } from "../../src/api/tags.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

const tag = { id: 5, title: "urgent", color: "#f00" };
const base = "https://api.weeek.net/public/v1/ws/tags";

describe("TagsApi", () => {
  it("list GETs /ws/tags", async () => {
    const f = jsonFetch(200, { success: true, tags: [tag] });
    expect(await new TagsApi(httpWith(f)).list()).toEqual([tag]);
    expect(sent(f).url).toBe(base);
  });

  it("get GETs /ws/tags/{id}", async () => {
    const f = jsonFetch(200, { success: true, tag });
    expect(await new TagsApi(httpWith(f)).get(5)).toEqual(tag);
    expect(sent(f).url).toBe(`${base}/5`);
  });

  it("create POSTs the title", async () => {
    const f = jsonFetch(200, { success: true, tag });
    expect(await new TagsApi(httpWith(f)).create({ title: "urgent" })).toEqual(tag);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ title: "urgent" });
  });

  it("update PUTs title + color then re-reads the tag", async () => {
    const f = jsonFetch(200, { success: true, tag });
    expect(await new TagsApi(httpWith(f)).update({ tagId: 5, update: { title: "urgent", color: "#f00" } })).toEqual(tag);
    expect(sent(f, 0).init.method).toBe("PUT");
    expect(sent(f, 0).url).toBe(`${base}/5`);
    expect(sent(f, 0).json()).toEqual({ title: "urgent", color: "#f00" });
    expect(sent(f, 1).url).toBe(`${base}/5`);
  });

  it("remove DELETEs the tag", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new TagsApi(httpWith(f)).remove(5)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/5`);
  });
});
