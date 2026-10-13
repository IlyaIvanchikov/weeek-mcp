import { describe, it, expect } from "vitest";
import { parseDay } from "../src/dates.js";

const now = new Date("2026-07-14T12:00:00Z"); // Tuesday

describe("parseDay", () => {
  it("passes ISO dates through", () => {
    expect(parseDay("2026-08-01", now)).toBe("2026-08-01");
  });
  it("parses 'tomorrow' relative to now", () => {
    expect(parseDay("tomorrow", now)).toBe("2026-07-15");
  });
  it("throws on nonsense", () => {
    expect(() => parseDay("banana", now)).toThrow(/could not parse date/);
  });
});
