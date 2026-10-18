import { describe, it, expect } from "vitest";
import { parseDay, parseDateTime, formatDayMonthYear } from "../src/dates.js";

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

describe("parseDateTime", () => {
  it("keeps an ISO instant and anchors a relative time on now", () => {
    expect(Date.parse(parseDateTime("2026-08-01T10:00:00Z", now))).toBe(Date.parse("2026-08-01T10:00:00Z"));
    expect(parseDateTime("in 2 hours", now)).toBe(new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString());
  });
  it("throws on nonsense", () => {
    expect(() => parseDateTime("banana", now)).toThrow(/could not parse date/);
  });
});

describe("formatDayMonthYear", () => {
  it("turns a Y-m-d day into the d.m.Y the task-create route wants", () => {
    expect(formatDayMonthYear("2026-11-20")).toBe("20.11.2026");
  });
  it("refuses anything that is not a Y-m-d day", () => {
    expect(() => formatDayMonthYear("20.11.2026")).toThrow(/Y-m-d/);
  });
});
