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

  it("keeps the user-facing label 'assignee' for members", async () => {
    const r = new Resolver(clientWith({ workspace: { listMembers: async () => [{ id: "u1", name: "Ilya" }] } }), freshCache());
    await expect(r.resolve({ kind: "member", value: "Nobody" })).rejects.toThrow(/could not resolve assignee "Nobody"/);
  });

  it("resolves a board inside its project", async () => {
    const list = vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]);
    const r = new Resolver(clientWith({ boards: { list } }), freshCache());
    expect(await r.resolve({ kind: "board", value: "main", scope: { projectId: 1 } })).toBe(10);
    expect(list).toHaveBeenCalledWith(1);
  });

  it("refuses to resolve a scoped kind by name without its scope", async () => {
    const r = new Resolver(clientWith({ boards: { list: async () => [] } }), freshCache());
    await expect(r.resolve({ kind: "board", value: "Main" })).rejects.toThrow(/needs projectId/);
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
});
