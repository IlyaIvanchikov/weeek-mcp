import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("buildServer", () => {
  it("builds a server without throwing given a valid config", () => {
    const server = buildServer({ token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 30000 });
    expect(server).toBeTruthy();
  });
});
