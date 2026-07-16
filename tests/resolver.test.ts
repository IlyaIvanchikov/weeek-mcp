import { describe, it, expect, vi } from "vitest";
import { Resolver } from "../src/resolver.js";
import { NameCache } from "../src/cache.js";

function clientWith(over: Partial<Record<string, any>>) {
  return over as any; // only the methods used per test are provided
}
const freshCache = () => new NameCache(100000, () => 0);

describe("Resolver", () => {
  it("passes a numeric id through without calling the API", async () => {
    const r = new Resolver(clientWith({}), freshCache());
    expect(await r.resolveProject(42)).toBe(42);
    expect(await r.resolveProject("42")).toBe(42);
  });

  it("resolves a unique case-insensitive name", async () => {
    const client = clientWith({ listProjects: async () => [{ id: 1, name: "Marketing" }, { id: 2, name: "Sales" }] });
    const r = new Resolver(client, freshCache());
    expect(await r.resolveProject("marketing")).toBe(1);
  });

  it("throws with candidates when the name is unknown", async () => {
    const client = clientWith({ listProjects: async () => [{ id: 1, name: "Marketing" }] });
    const r = new Resolver(client, freshCache());
    await expect(r.resolveProject("Markting")).rejects.toMatchObject({
      name: "ResolutionError", kind: "project",
    });
  });

  it("throws with the duplicates when the name is ambiguous", async () => {
    const client = clientWith({ listProjects: async () => [{ id: 1, name: "Ops" }, { id: 2, name: "ops" }] });
    const r = new Resolver(client, freshCache());
    await expect(r.resolveProject("Ops")).rejects.toMatchObject({ name: "ResolutionError" });
  });

  it("resolves a column across the project's boards", async () => {
    const client = clientWith({
      listBoards: async (_pid: number) => [{ id: 10, name: "Main" }],
      listColumns: async (_bid: number) => [{ id: 100, name: "In Progress" }, { id: 101, name: "Done" }],
    });
    const r = new Resolver(client, freshCache());
    expect(await r.resolveColumn(1, "in progress")).toBe(100);
  });

  it("resolves a column that only exists on the second board (regression lock)", async () => {
    const client = clientWith({
      listBoards: async (_pid: number) => [{ id: 10, name: "Main" }, { id: 20, name: "Secondary" }],
      listColumns: async (bid: number) =>
        bid === 10
          ? [{ id: 100, name: "In Progress" }]
          : [{ id: 200, name: "Backlog" }],
    });
    const r = new Resolver(client, freshCache());
    expect(await r.resolveColumn(1, "backlog")).toBe(200);
  });

  it("resolves a column scoped to a specific board", async () => {
    const listColumns = vi.fn(async (_bid: number) => [
      { id: 100, name: "In Progress" },
      { id: 101, name: "Done" },
    ]);
    const client = clientWith({ listColumns });
    const r = new Resolver(client, freshCache());
    expect(await r.resolveColumnInBoard(10, "done")).toBe(101);
    expect(listColumns).toHaveBeenCalledWith(10);
  });

  it("passes a numeric column id through without calling the API (board-scoped)", async () => {
    const listColumns = vi.fn();
    const client = clientWith({ listColumns });
    const r = new Resolver(client, freshCache());
    expect(await r.resolveColumnInBoard(10, 999)).toBe(999);
    expect(listColumns).not.toHaveBeenCalled();
  });

  it("passes a UUID assignee id through without calling the API", async () => {
    const r = new Resolver(clientWith({}), freshCache());
    expect(await r.resolveAssignee("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("resolves an assignee by name to the member's string id", async () => {
    const client = clientWith({ listMembers: async () => [{ id: "u1", name: "Ilya" }] });
    const r = new Resolver(client, freshCache());
    expect(await r.resolveAssignee("Ilya")).toBe("u1");
  });

  it("does not let a hex-looking display name pass through unresolved", async () => {
    const client = clientWith({ listMembers: async () => [{ id: "u1", name: "Ilya" }] });
    const r = new Resolver(client, freshCache());
    await expect(r.resolveAssignee("cafebabe")).rejects.toMatchObject({
      name: "ResolutionError", kind: "assignee",
    });
  });
});
