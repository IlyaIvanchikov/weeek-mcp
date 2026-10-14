import { describe, it, expect } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { resolveMembers } from "../../src/tools/members.js";
import { stubMembers } from "../helpers/tool-harness.js";

const [ilya, ann] = stubMembers;
const resolver = () => new Resolver({ workspace: { listMembers: async () => stubMembers } } as any, new NameCache(100_000, () => 0));

describe("resolveMembers", () => {
  it("resolves names and passes ids through", async () => {
    expect(await resolveMembers(resolver(), ["ilya", ann.id])).toEqual([ilya.id, ann.id]);
  });
  it("de-duplicates a member named twice, by name and by id", async () => {
    expect(await resolveMembers(resolver(), ["Ilya", ilya.id, "ilya"])).toEqual([ilya.id]);
  });
});
