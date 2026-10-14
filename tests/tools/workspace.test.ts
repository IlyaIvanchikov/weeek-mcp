import { describe, it, expect, vi } from "vitest";
import { registerWorkspaceTools } from "../../src/tools/workspace.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const clients = { id: 7, name: "Clients", parentId: null, isPrivate: false };
const urgent = { id: 5, title: "Urgent", color: "#f00" };
const client = () => ({
  portfolios: { list: vi.fn(async () => ({ portfolios: [clients], hasMore: false })), get: vi.fn(async () => clients) },
  tags: { list: vi.fn(async () => [urgent]), get: vi.fn(async () => urgent) },
  workspace: { get: vi.fn(async () => ({ id: 3, title: "Acme", description: null, isPersonal: false })) },
  user: { me: vi.fn(async () => ({ id: "u1", name: "Ilya", email: "i@x.y", language: "en", timeZone: null })) },
});

describe("workspace tools", () => {
  it("weeek_list_portfolios forwards search and paging, resolving the parent by name", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_list_portfolios", { search: "cli", parent: "Clients", limit: 10 }))).toEqual({ portfolios: [clients], hasMore: false });
    expect(c.portfolios.list).toHaveBeenLastCalledWith({ search: "cli", parentId: 7, limit: 10, offset: 0 });
  });

  it("weeek_get_portfolio resolves the name through the search", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_get_portfolio", { portfolio: "clients" }))).toEqual(clients);
    expect(c.portfolios.list).toHaveBeenCalledWith({ search: "clients", limit: 50 });
    expect(c.portfolios.get).toHaveBeenCalledWith(7);
  });

  it("weeek_create_portfolio resolves the parent and makes the new name resolvable at once", async () => {
    const c = client();
    const created = { id: 8, name: "Internal", parentId: 7, isPrivate: false };
    let known = [clients];
    const create = vi.fn(async () => { known = [clients, created]; return created; });
    c.portfolios.list.mockImplementation(async ({ search }: { search: string }) => ({ portfolios: known.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())), hasMore: false }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, create } });
    const before = await h.call("weeek_get_portfolio", { portfolio: "Internal" }); // caches an empty search result
    expect(before.isError).toBe(true);
    await h.call("weeek_create_portfolio", { name: "Internal", parent: "Clients" });
    expect(create).toHaveBeenCalledWith({ name: "Internal", parentId: 7 });
    await h.call("weeek_get_portfolio", { portfolio: "Internal" });
    expect(c.portfolios.get).toHaveBeenLastCalledWith(8);
  });

  it("weeek_update_portfolio renames by name or id", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...clients, name: "Customers" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, update } });
    await h.call("weeek_update_portfolio", { portfolio: 7, name: "Customers" });
    expect(update).toHaveBeenCalledWith({ portfolioId: 7, name: "Customers" });
  });

  it("weeek_delete_portfolio needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, remove } });
    expect(() => h.call("weeek_delete_portfolio", { portfolio: 7 })).toThrow(/confirm/);
    expect(remove).not.toHaveBeenCalled();
    await h.call("weeek_delete_portfolio", { portfolio: 7, confirm: true });
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("weeek_list_tags and weeek_get_tag read tags, the latter by title", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_list_tags", {}))).toEqual([urgent]);
    expect(reply(await h.call("weeek_get_tag", { tag: "urgent" }))).toEqual(urgent);
    expect(c.tags.get).toHaveBeenCalledWith(5);
  });

  it("weeek_create_tag makes the new title resolvable at once", async () => {
    const c = client();
    const created = { id: 6, title: "Later", color: "#00f" };
    const create = vi.fn(async () => created);
    c.tags.list.mockResolvedValueOnce([urgent]).mockResolvedValue([urgent, created]);
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, create } });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    await h.call("weeek_create_tag", { title: "Later" });
    expect(create).toHaveBeenCalledWith({ title: "Later" });
    await h.call("weeek_get_tag", { tag: "Later" });
    expect(c.tags.get).toHaveBeenLastCalledWith(6);
  });

  it("weeek_update_tag merges over the current tag so an omitted field survives", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...urgent, color: "#0f0" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, update } });
    await h.call("weeek_update_tag", { tag: "urgent", color: "#0f0" });
    expect(update).toHaveBeenCalledWith({ tagId: 5, update: { title: "Urgent", color: "#0f0" } });
  });

  it("weeek_delete_tag needs confirm:true", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, remove } });
    expect(() => h.call("weeek_delete_tag", { tag: 5 })).toThrow(/confirm/);
    expect(remove).not.toHaveBeenCalled();
    await h.call("weeek_delete_tag", { tag: 5, confirm: true });
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("weeek_get_workspace and weeek_get_profile pass the client's answer through", async () => {
    const c = client();
    const h = toolHarness(registerWorkspaceTools, c);
    expect(reply(await h.call("weeek_get_workspace", {}))).toEqual({ id: 3, title: "Acme", description: null, isPersonal: false });
    expect(reply(await h.call("weeek_get_profile", {}))).toEqual({ id: "u1", name: "Ilya", email: "i@x.y", language: "en", timeZone: null });
  });

  // Each write tool must drop the cached names it dirtied: warm the list, write, resolve again, expect a second fetch.
  it("weeek_create_portfolio forgets cached portfolios", async () => {
    const c = client();
    const create = vi.fn(async () => ({ id: 8, name: "Internal", parentId: null, isPrivate: false }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, create } });
    await h.call("weeek_get_portfolio", { portfolio: "Clients" });
    expect(c.portfolios.list).toHaveBeenCalledTimes(1);
    await h.call("weeek_create_portfolio", { name: "Internal" });
    await h.call("weeek_get_portfolio", { portfolio: "Clients" });
    expect(c.portfolios.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_portfolio forgets cached portfolios", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...clients, name: "Customers" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, update } });
    await h.call("weeek_get_portfolio", { portfolio: "Clients" });
    expect(c.portfolios.list).toHaveBeenCalledTimes(1);
    await h.call("weeek_update_portfolio", { portfolio: "Clients", name: "Customers" });
    await h.call("weeek_get_portfolio", { portfolio: "Clients" });
    expect(c.portfolios.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_delete_portfolio forgets cached portfolios", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerWorkspaceTools, { ...c, portfolios: { ...c.portfolios, remove } });
    await h.call("weeek_get_portfolio", { portfolio: "Clients" });
    expect(c.portfolios.list).toHaveBeenCalledTimes(1);
    await h.call("weeek_delete_portfolio", { portfolio: 7, confirm: true });
    await h.call("weeek_get_portfolio", { portfolio: "Clients" });
    expect(c.portfolios.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_create_tag forgets cached tags", async () => {
    const c = client();
    const create = vi.fn(async () => ({ id: 6, title: "Later", color: "#00f" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, create } });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    expect(c.tags.list).toHaveBeenCalledTimes(1);
    await h.call("weeek_create_tag", { title: "Later" });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    expect(c.tags.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_tag forgets cached tags", async () => {
    const c = client();
    const update = vi.fn(async () => ({ ...urgent, title: "Hot" }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, update } });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    expect(c.tags.list).toHaveBeenCalledTimes(1);
    await h.call("weeek_update_tag", { tag: 5, title: "Hot" });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    expect(c.tags.list).toHaveBeenCalledTimes(2);
  });

  it("weeek_update_tag reads the current tag once and keeps its title when only the colour changes", async () => {
    const c = client();
    const update = vi.fn(async () => urgent);
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, update } });
    await h.call("weeek_update_tag", { tag: 5, color: "#111" });
    expect(c.tags.get).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ tagId: 5, update: { title: "Urgent", color: "#111" } });
  });

  it("weeek_delete_tag forgets cached tags", async () => {
    const c = client();
    const remove = vi.fn(async () => ({ success: true }));
    const h = toolHarness(registerWorkspaceTools, { ...c, tags: { ...c.tags, remove } });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    expect(c.tags.list).toHaveBeenCalledTimes(1);
    await h.call("weeek_delete_tag", { tag: 5, confirm: true });
    await h.call("weeek_get_tag", { tag: "Urgent" });
    expect(c.tags.list).toHaveBeenCalledTimes(2);
  });
});
