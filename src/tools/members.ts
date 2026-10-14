import type { Resolver } from "../resolver.js";

/** Member ids for a list of names or ids, in order, each member once even if named twice. */
export async function resolveMembers(resolver: Resolver, values: Array<string | number>): Promise<string[]> {
  const ids = await Promise.all(values.map((value) => resolver.resolve({ kind: "member", value })));
  return [...new Set(ids)];
}
