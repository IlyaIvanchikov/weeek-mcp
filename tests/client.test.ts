import { describe, it, expect, vi } from "vitest";
import { WeeekClient } from "../src/client.js";
import { TasksApi } from "../src/api/tasks.js";
import { AttachmentsApi } from "../src/api/attachments.js";
import { UserApi } from "../src/api/user.js";
import { TagsApi } from "../src/api/tags.js";
import { PortfoliosApi } from "../src/api/portfolios.js";
import { httpConfig, jsonFetch, sent } from "./helpers/http.js";

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
    expect(typeof c.customFields.list).toBe("function");
    expect(typeof c.crm.funnels.list).toBe("function");
  });

  it("routes every resource client through the same injected fetch", async () => {
    const f = jsonFetch(200, { success: true, projects: [] });
    const c = new WeeekClient(httpConfig, f as unknown as typeof fetch);
    await c.projects.list();
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/projects");
  });
});
