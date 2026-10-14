import { describe, it, expect, vi } from "vitest";
import { registerProjectTools } from "../../src/tools/projects.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const marketing = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: null, team: [] };
const client = () => ({
  projects: { list: vi.fn(async () => [marketing]), get: vi.fn(async () => marketing) },
  boards: { list: vi.fn(async () => [{ id: 10, name: "Main", projectId: 1, isPrivate: false }, { id: 11, name: "Backlog", projectId: 1, isPrivate: false }]) },
  columns: { list: vi.fn(async () => [{ id: 100, name: "To do", boardId: 10 }, { id: 101, name: "Done", boardId: 10 }]) },
  portfolios: { list: vi.fn(async () => ({ portfolios: [{ id: 7, name: "Clients", parentId: null, isPrivate: false }], hasMore: false })) },
});

describe("project tools", () => {
  it("weeek_get_project resolves the name", async () => {
    const c = client();
    const h = toolHarness(registerProjectTools, c);
    expect(reply(await h.call("weeek_get_project", { project: "marketing" }))).toEqual(marketing);
    expect(c.projects.get).toHaveBeenCalledWith(1);
  });

  it("weeek_create_project resolves the portfolio, defaults private to false, and makes the new name resolvable at once", async () => {
    const c = client();
    const created = { ...marketing, id: 2, name: "Q4", portfolioId: 7 };
    const create = vi.fn(async () => created);
    c.projects.list.mockResolvedValueOnce([marketing]).mockResolvedValue([marketing, created]);
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, create } });
    await h.call("weeek_get_project", { project: "Marketing" }); // warms the cache
    expect(reply(await h.call("weeek_create_project", { name: "Q4", portfolio: "clients" }))).toEqual(created);
    expect(create).toHaveBeenCalledWith({ name: "Q4", isPrivate: false, description: undefined, portfolioId: 7 });
    await h.call("weeek_get_project", { project: "Q4" });
    expect(c.projects.get).toHaveBeenLastCalledWith(2);
    expect(c.projects.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_project merges over the current project so omitted fields survive", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...marketing, color: "#000" }));
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, update } });
    await h.call("weeek_update_project", { project: 1, color: "#000" });
    expect(update).toHaveBeenCalledWith({ projectId: 1, update: { name: "Marketing", isPrivate: false, color: "#000" } });
    await h.call("weeek_update_project", { project: 1, name: "Mkt", private: true });
    expect(update).toHaveBeenLastCalledWith({ projectId: 1, update: { name: "Mkt", isPrivate: true, color: "#fff" } });
  });

  it("weeek_archive_project needs confirm:true, defaults to archiving, and can restore", async () => {
    const c = client();
    const setArchived = vi.fn(async () => marketing);
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, setArchived } });
    expect(() => h.call("weeek_archive_project", { project: 1 })).toThrow(/confirm/);
    expect(setArchived).not.toHaveBeenCalled();
    await h.call("weeek_archive_project", { project: 1, confirm: true });
    expect(setArchived).toHaveBeenCalledWith({ projectId: 1, archived: true });
    await h.call("weeek_archive_project", { project: 1, archived: false, confirm: true });
    expect(setArchived).toHaveBeenLastCalledWith({ projectId: 1, archived: false });
  });

  it("weeek_delete_project needs confirm:true and forgets the project list", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, projects: { ...c.projects, remove } });
    await h.call("weeek_get_project", { project: "Marketing" });
    expect(() => h.call("weeek_delete_project", { project: "Marketing" })).toThrow(/confirm/);
    expect(remove).not.toHaveBeenCalled();
    expect(reply(await h.call("weeek_delete_project", { project: "Marketing", confirm: true }))).toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith(1);
    await h.call("weeek_get_project", { project: "Marketing" }).catch(() => undefined);
    expect(c.projects.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_create_board resolves the project and forgets its boards", async () => {
    const c = client();
    const create = vi.fn(async () => ({ id: 12, name: "QA", projectId: 1, isPrivate: false }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, create } });
    await h.call("weeek_update_board", { board: "Main", project: "Marketing", name: "Main 2" }).catch(() => undefined); // warms boards:1
    await h.call("weeek_create_board", { project: "Marketing", name: "QA" });
    expect(create).toHaveBeenCalledWith({ name: "QA", projectId: 1 });
    await h.call("weeek_update_board", { board: "QA", project: "Marketing", name: "QA 2" }).catch(() => undefined);
    expect(c.boards.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_board takes a board id, or a name with its project", async () => {
    const c = client();
    const update = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, update } });
    await h.call("weeek_update_board", { board: 10, name: "Main 2" });
    expect(update).toHaveBeenCalledWith({ boardId: 10, name: "Main 2" });
    await h.call("weeek_update_board", { board: "backlog", project: "Marketing", name: "Later" });
    expect(update).toHaveBeenLastCalledWith({ boardId: 11, name: "Later" });
  });

  it("weeek_delete_board needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, remove } });
    expect(() => h.call("weeek_delete_board", { board: 10 })).toThrow(/confirm/);
    expect(remove).not.toHaveBeenCalled();
    await h.call("weeek_delete_board", { board: 10, confirm: true });
    expect(remove).toHaveBeenCalledWith(10);
  });

  it("weeek_move_board resolves `after` in the same project, and null means first", async () => {
    const c = client();
    const move = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, boards: { ...c.boards, move } });
    await h.call("weeek_move_board", { board: "Backlog", project: "Marketing", after: "Main" });
    expect(move).toHaveBeenCalledWith({ boardId: 11, upperBoardId: 10 });
    await h.call("weeek_move_board", { board: 11, after: null });
    expect(move).toHaveBeenLastCalledWith({ boardId: 11, upperBoardId: null });
  });

  it("weeek_create_column resolves the board and forgets that board's columns", async () => {
    const c = client();
    const create = vi.fn(async () => ({ id: 102, name: "Review", boardId: 10 }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, create } });
    await h.call("weeek_update_column", { column: "Done", board: 10, name: "Shipped" }).catch(() => undefined); // warms board-columns:10
    await h.call("weeek_create_column", { board: 10, name: "Review" });
    expect(create).toHaveBeenCalledWith({ name: "Review", boardId: 10 });
    await h.call("weeek_update_column", { column: "Review", board: 10, name: "In review" }).catch(() => undefined);
    expect(c.columns.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_column resolves a column name inside its board, and a board name inside its project", async () => {
    const c = client();
    const update = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, update } });
    await h.call("weeek_update_column", { column: "done", board: "main", project: "Marketing", name: "Shipped" });
    expect(update).toHaveBeenCalledWith({ columnId: 101, name: "Shipped" });
  });

  it("weeek_update_column refuses a column name with no board or project", async () => {
    const c = client();
    const update = vi.fn();
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, update } });
    const res = await h.call("weeek_update_column", { column: "Done", name: "Shipped" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toMatch(/needs a board or a project \(name or id\)/);
    expect(update).not.toHaveBeenCalled();
  });

  it("weeek_delete_column needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, remove } });
    expect(() => h.call("weeek_delete_column", { column: 101 })).toThrow(/confirm/);
    expect(remove).not.toHaveBeenCalled();
    await h.call("weeek_delete_column", { column: 101, confirm: true });
    expect(remove).toHaveBeenCalledWith(101);
  });

  it("weeek_move_column resolves `after` on the same board, and null means first", async () => {
    const c = client();
    const move = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerProjectTools, { ...c, columns: { ...c.columns, move } });
    await h.call("weeek_move_column", { column: "To do", board: 10, after: "Done" });
    expect(move).toHaveBeenCalledWith({ columnId: 100, upperColumnId: 101 });
    await h.call("weeek_move_column", { column: 100, after: null });
    expect(move).toHaveBeenLastCalledWith({ columnId: 100, upperColumnId: null });
  });

  const ok = async () => ({ success: true });
  describe.each([
    { tool: "weeek_update_project", args: { project: "Marketing", name: "Mkt" }, stubs: { projects: { update: ok } }, warm: { kind: "project", value: "Marketing" }, list: "projects" },
    { tool: "weeek_archive_project", args: { project: "Marketing", confirm: true }, stubs: { projects: { setArchived: ok } }, warm: { kind: "project", value: "Marketing" }, list: "projects" },
    { tool: "weeek_update_board", args: { board: "Main", project: 1, name: "Renamed" }, stubs: { boards: { update: ok } }, warm: { kind: "board", value: "Main", scope: { projectId: 1 } }, list: "boards" },
    { tool: "weeek_delete_board", args: { board: "Main", project: 1, confirm: true }, stubs: { boards: { remove: ok } }, warm: { kind: "board", value: "Main", scope: { projectId: 1 } }, list: "boards" },
    { tool: "weeek_update_column", args: { column: "To do", board: 10, name: "Renamed" }, stubs: { columns: { update: ok } }, warm: { kind: "column", value: "To do", scope: { boardId: 10 } }, list: "columns" },
    { tool: "weeek_delete_column", args: { column: "To do", board: 10, confirm: true }, stubs: { columns: { remove: ok } }, warm: { kind: "column", value: "To do", scope: { boardId: 10 } }, list: "columns" },
  ] as const)("$tool forgets what it changed", ({ tool, args, stubs, warm, list }) => {
    it("so the next lookup by name loads the list again", async () => {
      const c = client();
      const h = toolHarness(registerProjectTools, {
        ...c,
        ...Object.fromEntries(Object.entries(stubs).map(([group, methods]) => [group, { ...(c as any)[group], ...methods }])),
      });
      await h.resolver.resolve(warm as any); // warms the cache
      await h.call(tool, args);
      await h.resolver.resolve(warm as any);
      expect(c[list].list).toHaveBeenCalledTimes(2);
    });
  });
});
