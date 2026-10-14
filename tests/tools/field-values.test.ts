import { describe, it, expect } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { encodeTaskFields } from "../../src/tools/field-values.js";
import { stubMembers } from "../helpers/tool-harness.js";
import type { CustomField } from "../../src/client.js";

const [ilya, ann] = stubMembers;
const review = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" };
const done = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Done", color: "green" };
const field = (over: Partial<CustomField> & Pick<CustomField, "name" | "type">): CustomField => ({ id: `id-${over.name}`, config: null, options: [], ...over });
const fields: CustomField[] = [
  field({ name: "Notes", type: "text" }), field({ name: "Link", type: "link" }), field({ name: "Estimate", type: "number" }),
  field({ name: "Urgent", type: "boolean" }), field({ name: "Deadline", type: "datetime" }), field({ name: "Stage", type: "select", options: [review, done] }),
  field({ name: "Areas", type: "multiselect", options: [review, done] }), field({ name: "Owners", type: "member" }), field({ name: "Sign-off", type: "approval" }),
  field({ name: "Client", type: "contact" }), field({ name: "Mystery", type: null }),
];
const resolver = () => new Resolver({ workspace: { listMembers: async () => stubMembers } } as any, new NameCache(100_000, () => 0));

describe("encodeTaskFields", () => {
  it("encodes every type by name, resolving options and members", async () => {
    const body = await encodeTaskFields({ resolver: resolver(), fields, values: {
      Link: "https://x.y", Estimate: 5, Urgent: true, Deadline: "2026-08-01T10:00:00Z",
      Stage: "review", Areas: ["Done", review.id], Owners: ["ilya", ann.id], "Sign-off": ["Ann"], Client: "c1", "id-Notes": null,
    } });
    expect(body).toEqual({
      "id-Notes": null, "id-Link": "https://x.y", "id-Estimate": 5, "id-Urgent": true, "id-Deadline": "2026-08-01T10:00:00.000Z",
      "id-Stage": review.id, "id-Areas": [done.id, review.id], "id-Owners": [ilya.id, ann.id], "id-Sign-off": [ann.id], "id-Client": "c1",
    });
  });

  it("names the field and the shape it takes when the value has the wrong shape", async () => {
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Estimate: "five" } })).rejects.toThrow(/custom field "Estimate" \(number\) takes a number/);
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Areas: "Done" } })).rejects.toThrow(/takes a list of option names or ids/);
  });

  it("reports an unknown option or field with candidates, before anything else is encoded", async () => {
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Stage: "Reviw" } })).rejects.toMatchObject({ name: "ResolutionError", candidates: [] });
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Stag: "Review" } })).rejects.toMatchObject({ name: "ResolutionError", candidates: [{ id: "id-Stage", name: "Stage" }] });
  });

  it("refuses a field whose type the server does not know", async () => {
    await expect(encodeTaskFields({ resolver: resolver(), fields, values: { Mystery: "x" } })).rejects.toThrow(/type this server does not know/);
  });
});
