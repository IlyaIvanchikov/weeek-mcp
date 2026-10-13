import { describe, it, expect, vi } from "vitest";
import { NameCache } from "../src/cache.js";

describe("NameCache", () => {
  it("loads once and memoises within TTL", async () => {
    let clock = 0;
    const cache = new NameCache(1000, () => clock);
    const load = vi.fn(async () => [{ id: 1, name: "A" }]);
    expect(await cache.get("projects", load)).toEqual([{ id: 1, name: "A" }]);
    clock = 999;
    await cache.get("projects", load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("reloads after TTL expiry", async () => {
    let clock = 0;
    const cache = new NameCache(1000, () => clock);
    const load = vi.fn(async () => [{ id: 1, name: "A" }]);
    await cache.get("projects", load);
    clock = 1001;
    await cache.get("projects", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("invalidate forces a reload", async () => {
    const cache = new NameCache(100000, () => 0);
    const load = vi.fn(async () => [{ id: 1, name: "A" }]);
    await cache.get("projects", load);
    cache.invalidate("projects");
    await cache.get("projects", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("invalidatePrefix drops the key itself and every scoped key under it, not look-alikes", async () => {
    const cache = new NameCache(100000, () => 0);
    const load = vi.fn(async () => []);
    await cache.get("boards:1", load);
    await cache.get("boards:1:x", load);
    await cache.get("boards:10", load);
    cache.invalidatePrefix("boards:1");
    await cache.get("boards:1", load);
    await cache.get("boards:1:x", load);
    await cache.get("boards:10", load);
    expect(load).toHaveBeenCalledTimes(5);
  });
});
