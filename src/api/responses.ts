import type { Member, Profile, Workspace } from "./types.js";

/** The API's JSON is untyped until a normaliser reads it; this is the one place that assumption is made. */
export function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

/** True when `value` is a member of the closed list, narrowing it; the wire sends plain strings and numbers. */
export function isOneOf<T extends readonly (string | number)[]>(list: T, value: unknown): value is T[number] {
  return (list as readonly unknown[]).includes(value);
}

/** The API wraps lists under a resource-specific key; fall back to the first array present. */
export function pickArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (Array.isArray(v)) return v;
  for (const value of Object.values(obj)) if (Array.isArray(value)) return value;
  return [];
}

/** First, middle and last name joined with single spaces, blanks skipped — how contacts are named. */
export function fullName(raw: unknown): string {
  const r = asRecord(raw);
  return [r.firstName, r.middleName, r.lastName].filter(Boolean).map(String).join(" ").trim();
}

/** A wire list as strings; anything that is not a list is empty. */
export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function toMember(raw: unknown): Member {
  const r = asRecord(raw);
  // First and last name only, as in 0.7.0: a middle name must not stop "First Last" from resolving a member.
  const name = [r.firstName, r.lastName].filter(Boolean).map(String).join(" ").trim() || r.name || r.email || String(r.id ?? "");
  return { id: String(r.id ?? ""), name: String(name) };
}

export function toProfile(raw: unknown): Profile {
  const r = asRecord(raw);
  return {
    ...toMember(r),
    email: String(r.email ?? ""),
    language: r.language == null ? null : String(r.language),
    timeZone: r.timeZone == null ? null : String(r.timeZone),
  };
}

export function toWorkspace(raw: unknown): Workspace {
  const r = asRecord(raw);
  return { id: Number(r.id), title: String(r.title ?? ""), description: r.description == null ? null : String(r.description), isPersonal: Boolean(r.isPersonal) };
}

/** The API sends no "more" flag for organizations and contacts: a full page, when one was asked for, means there may be more. */
export function pageHasMore(count: number, limit: number | undefined): boolean {
  return limit !== undefined && count >= limit;
}
