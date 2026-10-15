import { describe, it, expect } from "vitest";
import { mapWithLimit } from "../src/concurrency.js";

describe("mapWithLimit", () => {
  it("keeps the input order and never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithLimit([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5 * (6 - n)));
      inFlight -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
  it("is [] for no items and rejects when a mapper rejects", async () => {
    expect(await mapWithLimit([], 3, async (n: number) => n)).toEqual([]);
    await expect(mapWithLimit([1], 3, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
