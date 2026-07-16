import * as chrono from "chrono-node";

export function parseDueDate(input: string, now: Date = new Date()): string {
  const dt = chrono.parseDate(input, now, { forwardDate: true });
  if (!dt) throw new Error(`could not parse date: "${input}"`);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
