import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { listTools } from "./helpers/list-tools.js";
import { defaultToolNames } from "./helpers/tool-names.js";
import { httpConfig } from "./helpers/http.js";
import type { Config } from "../src/config.js";

const cfg: Config = { ...httpConfig, attachMaxBytes: 1024, toolsets: ["tasks"] };

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
