import * as chrono from "chrono-node";

/** A natural-language date or time as an ISO 8601 instant, for datetime custom fields. */
export function parseDateTime(input: string, now: Date = new Date()): string {
  const dt = chrono.parseDate(input, now, { forwardDate: true });
  if (!dt) throw new Error(`could not parse date: "${input}"`);
  return dt.toISOString();
}

export function parseDay(input: string, now: Date = new Date()): string {
  const dt = chrono.parseDate(input, now, { forwardDate: true });
  if (!dt) throw new Error(`could not parse date: "${input}"`);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
