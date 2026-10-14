import { describe, it, expect, vi } from "vitest";
import { Resolver } from "../src/resolver.js";
import { NameCache } from "../src/cache.js";

function clientWith(over: Record<string, any>) {
  return over as any; // only the resource methods a test needs are provided
}
const freshCache = () => new NameCache(100000, () => 0);
const projects = [{ id: 1, name: "Marketing" }, { id: 2, name: "Sales" }];

describe("Resolver.resolve", () => {
  it("passes an integer id through without calling the API", async () => {
    const list = vi.fn();
    const r = new Resolver(clientWith({ projects: { list } }), freshCache());
    expect(await r.resolve({ kind: "project", value: 42 })).toBe(42);
    expect(await r.resolve({ kind: "project", value: "42" })).toBe(42);
    expect(list).not.toHaveBeenCalled();
  });

  it("passes a UUID through for a uuid-shaped kind", async () => {
    const listMembers = vi.fn();
    const r = new Resolver(clientWith({ workspace: { listMembers } }), freshCache());
    const uuid = "a2318d51-46cd-42a9-bab4-554c80824574";
    expect(await r.resolve({ kind: "member", value: uuid })).toBe(uuid);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("does not treat digits as an id for a uuid-shaped kind", async () => {
    const listMembers = vi.fn(async () => [{ id: "u1", name: "42" }]);
    const r = new Resolver(clientWith({ workspace: { listMembers } }), freshCache());
    expect(await r.resolve({ kind: "member", value: "42" })).toBe("u1");
  });

  it("resolves a unique case-insensitive name", async () => {
    const r = new Resolver(clientWith({ projects: { list: async () => projects } }), freshCache());
    expect(await r.resolve({ kind: "project", value: "marketing" })).toBe(1);
  });

  it("throws with candidates when the name is unknown", async () => {
    const r = new Resolver(clientWith({ projects: { list: async () => projects } }), freshCache());
    await expect(r.resolve({ kind: "project", value: "Markting" })).rejects.toMatchObject({ name: "ResolutionError", kind: "project" });
  });

  it("throws with the duplicates when the name is ambiguous", async () => {
    const r = new Resolver(clientWith({ projects: { list: async () => [{ id: 1, name: "Ops" }, { id: 2, name: "ops" }] } }), freshCache());
    await expect(r.resolve({ kind: "project", value: "Ops" })).rejects.toMatchObject({ name: "ResolutionError", candidates: [{ id: 1, name: "Ops" }, { id: 2, name: "ops" }] });
  });

  it("labels members as 'member'", async () => {
    const r = new Resolver(clientWith({ workspace: { listMembers: async () => [{ id: "u1", name: "Ilya" }] } }), freshCache());
    await expect(r.resolve({ kind: "member", value: "Nobody" })).rejects.toThrow(/could not resolve member "Nobody"/);
  });

  it("resolves a board inside its project", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    expect(await r.resolve({ kind: "board", value: "main", scope: { projectId: 1 } })).toBe(10);
    expect(list).toHaveBeenCalledWith(1);
  });

  it("refuses to resolve a scoped kind by name without its scope", async () => {
    const r = new Resolver(clientWith({ boards: { list: async () => [] } }), freshCache());
    await expect(r.resolve({ kind: "board", value: "Main" })).rejects.toThrow(/needs a project \(name or id\)/);
  });

  it("resolves a column across all boards of a project", async () => {
    const client = clientWith({
      boards: { list: async (_pid: number) => [{ id: 10, name: "A" }, { id: 11, name: "B" }] },
      columns: { list: async (bid: number) => bid === 10 ? [{ id: 100, name: "To do" }] : [{ id: 110, name: "Done" }] },
    });
    const r = new Resolver(client, freshCache());
    expect(await r.resolve({ kind: "column", value: "done", scope: { projectId: 1 } })).toBe(110);
  });

  it("resolves a column inside one board when boardId is given", async () => {
    const list = vi.fn(async (_bid: number) => [{ id: 100, name: "In Progress" }]);
    const r = new Resolver(clientWith({ columns: { list } }), freshCache());
    expect(await r.resolve({ kind: "column", value: "in progress", scope: { boardId: 10 } })).toBe(100);
    expect(list).toHaveBeenCalledWith(10);
  });

  it("caches a list per kind and scope", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 2 } });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("resolves a member by full name", async () => {
    const r = new Resolver(clientWith({ workspace: { listMembers: async () => [{ id: "u9", name: "Ilya I" }] } }), freshCache());
    expect(await r.resolve({ kind: "member", value: "ilya i" })).toBe("u9");
  });
  it("passes a numeric id through for a scoped kind without needing the scope", async () => {
    const list = vi.fn();
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    expect(await r.resolve({ kind: "board", value: "10" })).toBe(10);
    expect(list).not.toHaveBeenCalled();
  });

  it("trims whitespace around a UUID before passing it through", async () => {
    const uuid = "a2318d51-46cd-42a9-bab4-554c80824574";
    const r = new Resolver(clientWith({ workspace: { listMembers: vi.fn() } }), freshCache());
    expect(await r.resolve({ kind: "member", value: `  ${uuid} ` })).toBe(uuid);
  });

  it("caps substring candidates at five", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `Ops ${i + 1}` }));
    const r = new Resolver(clientWith({ projects: { list: async () => many } }), freshCache());
    await expect(r.resolve({ kind: "project", value: "ops" })).rejects.toMatchObject({ candidates: many.slice(0, 5) });
  });

  it("names both scopes a column can be resolved in", async () => {
    const r = new Resolver(clientWith({ columns: { list: async () => [] } }), freshCache());
    await expect(r.resolve({ kind: "column", value: "Done" })).rejects.toThrow(/needs a board or a project \(name or id\)/);
  });

  it("resolves a tag by its title", async () => {
    const r = new Resolver(clientWith({ tags: { list: async () => [{ id: 5, title: "Urgent", color: "#f00" }] } }), freshCache());
    expect(await r.resolve({ kind: "tag", value: "urgent" })).toBe(5);
  });

  it("resolves a portfolio through the server-side search, bounded and cached per query", async () => {
    const list = vi.fn(async (_query: { search: string; limit: number }) => ({ portfolios: [{ id: 7, name: "Clients", parentId: null, isPrivate: false }], hasMore: false }));
    const r = new Resolver(clientWith({ portfolios: { list } }), freshCache());
    expect(await r.resolve({ kind: "portfolio", value: "Clients" })).toBe(7);
    expect(await r.resolve({ kind: "portfolio", value: "clients" })).toBe(7);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ search: "Clients", limit: 50 });
  });

  it("forget makes the next resolve reload that kind in that scope", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    r.forget({ kind: "board", scope: { projectId: 1 } });
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("forget on a search kind drops every cached query", async () => {
    const list = vi.fn(async () => ({ portfolios: [{ id: 7, name: "Clients", parentId: null, isPrivate: false }], hasMore: false }));
    const r = new Resolver(clientWith({ portfolios: { list } }), freshCache());
    await r.resolve({ kind: "portfolio", value: "Clients" });
    r.forget({ kind: "portfolio" });
    await r.resolve({ kind: "portfolio", value: "Clients" });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("forget on a scoped kind without a scope does not throw and the next resolve re-reads", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    expect(() => r.forget({ kind: "board" })).not.toThrow();
    await r.resolve({ kind: "board", value: "Main", scope: { projectId: 1 } });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("forgetting a column by board also drops the project-wide column aggregate", async () => {
    const boardsList = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const columnsList = vi.fn(async (_bid: number) => [{ id: 100, name: "Done" }]);
    const r = new Resolver(clientWith({ boards: { list: boardsList }, columns: { list: columnsList } }), freshCache());
    await r.resolve({ kind: "column", value: "Done", scope: { projectId: 1 } });
    r.forget({ kind: "column", scope: { boardId: 10 } });
    await r.resolve({ kind: "column", value: "Done", scope: { projectId: 1 } });
    expect(columnsList).toHaveBeenCalledTimes(2);
  });

  it("forgetting a board drops that project's column aggregate", async () => {
    const boardsList = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const columnsList = vi.fn(async (_bid: number) => [{ id: 100, name: "Done" }]);
    const r = new Resolver(clientWith({ boards: { list: boardsList }, columns: { list: columnsList } }), freshCache());
    await r.resolve({ kind: "column", value: "Done", scope: { projectId: 1 } });
    r.forget({ kind: "board", scope: { projectId: 1 } });
    await r.resolve({ kind: "column", value: "Done", scope: { projectId: 1 } });
    expect(boardsList).toHaveBeenCalledTimes(2);
    expect(columnsList).toHaveBeenCalledTimes(2);
  });

  it("resolves a funnel by name, or by its opaque id, only against the loaded list", async () => {
    const list = vi.fn(async () => [{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [] }]);
    const r = new Resolver(clientWith({ crm: { funnels: { list } } }), freshCache());
    expect(await r.resolve({ kind: "funnel", value: "sales" })).toBe("OLY24hy2mC7n9D9l");
    expect(await r.resolve({ kind: "funnel", value: "OLY24hy2mC7n9D9l" })).toBe("OLY24hy2mC7n9D9l");
    await expect(r.resolve({ kind: "funnel", value: "ZZZ24hy2mC7n9D9l" })).rejects.toThrow(/could not resolve funnel "ZZZ24hy2mC7n9D9l"; candidates: none/);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("resolves a custom field inside its scope, caching each scope apart", async () => {
    const field = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Estimate", type: "number", config: null, options: [] };
    const list = vi.fn(async (scope: { kind: string }) => (scope.kind === "global" ? [field] : []));
    const r = new Resolver(clientWith({ customFields: { list } }), freshCache());
    expect(await r.resolve({ kind: "customField", value: "estimate" })).toBe(field.id);
    await expect(r.resolve({ kind: "customField", value: "estimate", scope: { fieldScope: { kind: "project", projectId: 2 } } })).rejects.toThrow(/could not resolve custom field "estimate"/);
    expect(list).toHaveBeenNthCalledWith(1, { kind: "global" });
    expect(list).toHaveBeenNthCalledWith(2, { kind: "project", projectId: 2 });
  });

  it("find returns the matched entry itself, for a name and for an id", async () => {
    const field = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [{ id: "o1", name: "Review", color: "blue" }] };
    const r = new Resolver(clientWith({ customFields: { list: async () => [field] } }), freshCache());
    expect(await r.find({ kind: "customField", value: "stage" })).toEqual(field);
    expect(await r.find({ kind: "customField", value: field.id })).toEqual(field);
    await expect(r.find({ kind: "customField", value: "0b1e4d7c-9999-4aaa-8bbb-000000000009" })).rejects.toThrow(/could not resolve custom field/);
  });

  it("list returns the cached entries of a scope", async () => {
    const list = vi.fn(async () => [{ id: 1, name: "Marketing" }]);
    const r = new Resolver(clientWith({ projects: { list } }), freshCache());
    expect(await r.list({ kind: "project" })).toEqual([{ id: 1, name: "Marketing" }]);
    await r.list({ kind: "project" });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("forgetting a custom field drops every field scope", async () => {
    const list = vi.fn(async () => []);
    const r = new Resolver(clientWith({ customFields: { list } }), freshCache());
    await r.list({ kind: "customField" });
    await r.list({ kind: "customField", scope: { fieldScope: { kind: "board", boardId: 3 } } });
    r.forget({ kind: "customField" });
    await r.list({ kind: "customField" });
    await r.list({ kind: "customField", scope: { fieldScope: { kind: "board", boardId: 3 } } });
    expect(list).toHaveBeenCalledTimes(4);
  });

  it("forgetting a board in a project also drops the per-board column lists", async () => {
    const boardsList = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const columnsList = vi.fn(async (_bid: number) => [{ id: 100, name: "Done" }]);
    const r = new Resolver(clientWith({ boards: { list: boardsList }, columns: { list: columnsList } }), freshCache());
    await r.resolve({ kind: "column", value: "Done", scope: { boardId: 10 } });
    r.forget({ kind: "board", scope: { projectId: 1 } });
    await r.resolve({ kind: "column", value: "Done", scope: { boardId: 10 } });
    expect(columnsList).toHaveBeenCalledTimes(2);
  });
});
