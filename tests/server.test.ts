import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { listTools } from "./helpers/list-tools.js";
import { defaultToolNames } from "./helpers/default-tool-names.js";

const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 30000, attachMaxBytes: 1024, toolsets: ["tasks"] as const };

describe("buildServer", () => {
  it("registers the default toolset's tools — the list a client actually receives", async () => {
    const names = (await listTools(buildServer(cfg))).map((t) => t.name).sort();
    expect(names).toEqual(defaultToolNames);
  });

  it("boots without a token so registries can list the tools", async () => {
    const names = (await listTools(buildServer({ ...cfg, token: undefined }))).map((t) => t.name);
    expect(names).toContain("weeek_create_task");
  });
});
