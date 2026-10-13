import { describe, it, expect, vi } from "vitest";
import { WeeekClient } from "../src/client.js";
import { TasksApi } from "../src/api/tasks.js";
import { AttachmentsApi } from "../src/api/attachments.js";
import { UserApi } from "../src/api/user.js";
import { TagsApi } from "../src/api/tags.js";
import { PortfoliosApi } from "../src/api/portfolios.js";
import { httpConfig } from "./helpers/http.js";

describe("WeeekClient facade", () => {
  it("exposes one resource client per API area", () => {
    const c = new WeeekClient(httpConfig);
    expect(c.tasks).toBeInstanceOf(TasksApi);
    expect(c.attachments).toBeInstanceOf(AttachmentsApi);
    expect(c.user).toBeInstanceOf(UserApi);
    expect(c.tags).toBeInstanceOf(TagsApi);
    expect(c.portfolios).toBeInstanceOf(PortfoliosApi);
    expect(typeof c.workspace.get).toBe("function");
    expect(typeof c.projects.list).toBe("function");
    expect(typeof c.boards.list).toBe("function");
    expect(typeof c.columns.list).toBe("function");
    expect(typeof c.workspace.listMembers).toBe("function");
  });

  it("routes every resource client through the same injected fetch", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true, projects: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const c = new WeeekClient(httpConfig, f as unknown as typeof fetch);
    await c.projects.list();
    expect(String(f.mock.calls[0][0])).toBe("https://api.weeek.net/public/v1/tm/projects");
  });
});
