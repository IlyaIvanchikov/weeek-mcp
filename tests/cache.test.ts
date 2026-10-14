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
  it("shares one in-flight load between concurrent gets of a key", async () => {
    const cache = new NameCache(100000, () => 0);
    const projects = [{ id: 1, name: "A" }];
    const load = vi.fn(async () => projects);
    const [first, second] = await Promise.all([cache.get("projects", load), cache.get("projects", load)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual(projects);
    expect(second).toEqual(projects);
  });
  it("does not cache a failed load and retries on the next get", async () => {
    const cache = new NameCache(100000, () => 0);
    const projects = [{ id: 1, name: "A" }];
    const load = vi.fn<() => Promise<typeof projects>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(projects);
    const settled = await Promise.allSettled([cache.get("projects", load), cache.get("projects", load)]);
    expect(settled.map((outcome) => outcome.status)).toEqual(["rejected", "rejected"]);
    expect(await cache.get("projects", load)).toEqual(projects);
    expect(load).toHaveBeenCalledTimes(2);
  });

  describe.each([
    ["invalidate", (cache: NameCache) => cache.invalidate("projects")],
    ["invalidatePrefix", (cache: NameCache) => cache.invalidatePrefix("projects")],
  ])("%s while a load is in flight", (_name, invalidateKey) => {
    it("drops that load, so the next get loads again", async () => {
      const cache = new NameCache(100000, () => 0);
      const staleProjects = [{ id: 1, name: "Old" }];
      const freshProjects = [{ id: 2, name: "New" }];
      let resolveStale!: (projects: typeof staleProjects) => void;
      const staleLoad = vi.fn(() => new Promise<typeof staleProjects>((resolve) => { resolveStale = resolve; }));
      const freshLoad = vi.fn(async () => freshProjects);
      const pending = cache.get("projects", staleLoad);
      invalidateKey(cache);
      resolveStale(staleProjects);
      await pending;
      expect(await cache.get("projects", freshLoad)).toEqual(freshProjects);
      expect(freshLoad).toHaveBeenCalledTimes(1);
    });
  });
});
