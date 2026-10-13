import type { Member } from "./types.js";

/** The API wraps lists under a resource-specific key; fall back to the first array present. */
export function pickArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (Array.isArray(v)) return v;
  for (const value of Object.values(obj)) if (Array.isArray(value)) return value;
  return [];
}

export function toMember(raw: any): Member {
  const joined = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
  const name = joined || raw.name || raw.email || String(raw.id ?? "");
  return { id: String(raw.id ?? ""), name: String(name) };
}
