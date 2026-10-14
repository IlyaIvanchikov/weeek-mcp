import type { WeeekClient } from "./client.js";
import type { NameCache } from "./cache.js";
import type { CustomField, FieldScope, Funnel } from "./api/types.js";
import { globalScope } from "./api/custom-fields.js";
import { ResolutionError, type Candidate } from "./errors.js";

/**
 * How an id looks on the wire. An opaque id (a funnel's "OLY24hy2mC7n9D9l") has no pattern a
 * name could not also have, so it is only ever recognised against the loaded collection.
 */
export type IdShape = "integer" | "uuid" | "opaque";
export type LoadStrategy = "list" | "search";

// A server-side search is never paged in full: this many candidates is plenty to pick one
// exact match from or to show as suggestions.
const searchPageSize = 50;

export interface Named<Id extends number | string> { id: Id; name: string; }
/** The ids a load may depend on; each kind reads the ones it needs and ignores the rest. */
export interface ResolveScope { projectId?: number; boardId?: number; fieldScope?: FieldScope; }

/** What the resolver needs to know about one kind of named thing, and what its load returns. */
interface KindBase<Entry extends Named<number | string>> {
  /** The word used in error messages — the tool parameter's name, not the API's. */
  label: string;
  /** "list" loads the whole (small) collection once; "search" asks the API for the query and caches per query. */
  strategy: LoadStrategy;
  /** Cache prefix; must include every scope id the load depends on. A search kind caches under `${prefix}:${query}`. */
  cacheKey(scope: ResolveScope): string;
  load(client: WeeekClient, scope: ResolveScope, query: string): Promise<Entry[]>;
  /**
   * Every cache prefix a write to this kind makes stale. Never throws: a missing scope widens
   * to the bare prefixes (drop more, re-read once) instead of failing the write that called it.
   */
  forgetPrefixes(scope: ResolveScope): string[];
}
// The shape names the id type, so a kind cannot declare uuid ids and load numeric ones.
interface IntegerKind<Entry extends Named<number> = Named<number>> extends KindBase<Entry> { shape: "integer"; }
interface UuidKind<Entry extends Named<string> = Named<string>> extends KindBase<Entry> { shape: "uuid"; }
interface OpaqueKind<Entry extends Named<string> = Named<string>> extends KindBase<Entry> { shape: "opaque"; }
type Kind = IntegerKind | UuidKind | OpaqueKind;

interface KindTable {
  project: IntegerKind;
  board: IntegerKind;
  column: IntegerKind;
  member: UuidKind;
  tag: IntegerKind;
  portfolio: IntegerKind;
  funnel: OpaqueKind<Funnel>;
  customField: UuidKind<CustomField>;
}
export type KindName = keyof KindTable;
/** The entry type a kind's load returns — what `find` and `list` hand back. */
export type EntryOf<K extends KindName> = Awaited<ReturnType<KindTable[K]["load"]>>[number];
type IdOf<K extends KindName> = EntryOf<K>["id"];

export interface ResolveOptions<K extends KindName> {
  kind: K;
  value: string | number;
  scope?: ResolveScope;
}
export interface ListOptions<K extends KindName> { kind: K; scope?: ResolveScope; }
export interface ForgetOptions { kind: KindName; scope?: ResolveScope; }

const INTEGER_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phrased for the tool caller, who passes a name or an id, not the resolver's scope fields.
const boardScopeNeed = "a project (name or id)";
const columnScopeNeed = "a board or a project (name or id)";

function requireScope<T>(value: T | undefined, label: string, needed: string): T {
  if (value === undefined) throw new Error(`resolving a ${label} by name needs ${needed}`);
  return value;
}

function fieldScopeKey(scope: FieldScope): string {
  switch (scope.kind) {
    case "global": return "global";
    case "project": return `project:${scope.projectId}`;
    case "board": return `board:${scope.boardId}`;
    case "funnel": return `funnel:${scope.funnelId}`;
    default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
  }
}

const kinds: KindTable = {
  project: {
    shape: "integer", label: "project", strategy: "list",
    cacheKey: () => "projects",
    forgetPrefixes: () => ["projects"],
    load: (client) => client.projects.list(),
  },
  board: {
    shape: "integer", label: "board", strategy: "list",
    cacheKey: (scope) => `boards:${requireScope(scope.projectId, "board", boardScopeNeed)}`,
    // The project-wide column aggregate is built from the boards, and the per-board lists cannot
    // be mapped to a project without a fetch, so a board write dirties all three families.
    forgetPrefixes: ({ projectId }) => projectId !== undefined
      ? [`boards:${projectId}`, `columns:${projectId}`, "board-columns"]
      : ["boards", "columns", "board-columns"],
    load: (client, scope) => client.boards.list(requireScope(scope.projectId, "board", boardScopeNeed)),
  },
  column: {
    shape: "integer", label: "column", strategy: "list",
    cacheKey: (scope) => scope.boardId !== undefined
      ? `board-columns:${scope.boardId}`
      : `columns:${requireScope(scope.projectId, "column", columnScopeNeed)}`,
    // A boardId cannot be mapped to its project without a fetch, so both families go entirely.
    forgetPrefixes: () => ["board-columns", "columns"],
    load: async (client, scope) => {
      if (scope.boardId !== undefined) return client.columns.list(scope.boardId);
      const boards = await client.boards.list(requireScope(scope.projectId, "column", columnScopeNeed));
      const all: Named<number>[] = [];
      for (const board of boards) all.push(...(await client.columns.list(board.id)));
      return all;
    },
  },
  member: {
    shape: "uuid", label: "member", strategy: "list",
    cacheKey: () => "members",
    forgetPrefixes: () => ["members"],
    load: (client) => client.workspace.listMembers(),
  },
  tag: {
    shape: "integer", label: "tag", strategy: "list",
    cacheKey: () => "tags",
    forgetPrefixes: () => ["tags"],
    // Tags carry `title`, not `name`; the resolver only ever matches on `name`.
    load: async (client) => (await client.tags.list()).map((tag) => ({ id: tag.id, name: tag.title })),
  },
  portfolio: {
    shape: "integer", label: "portfolio", strategy: "search",
    cacheKey: () => "portfolios",
    forgetPrefixes: () => ["portfolios"],
    // Only the first searchPageSize matches are considered, so an exact match beyond them is reported as not found, with candidates.
    load: async (client, _scope, query) => (await client.portfolios.list({ search: query, limit: searchPageSize })).portfolios,
  },
  funnel: {
    shape: "opaque", label: "funnel", strategy: "list",
    cacheKey: () => "funnels",
    forgetPrefixes: () => ["funnels"],
    load: (client) => client.crm.funnels.list(),
  },
  customField: {
    shape: "uuid", label: "custom field", strategy: "list",
    cacheKey: (scope) => `fields:${fieldScopeKey(scope.fieldScope ?? globalScope)}`,
    // A board's list is derived from the global and the project lists, so one field write dirties every scope.
    forgetPrefixes: () => ["fields"],
    load: (client, scope) => client.customFields.list(scope.fieldScope ?? globalScope),
  },
};

export class Resolver {
  constructor(private client: WeeekClient, private cache: NameCache) {}

  /** Exactly one case-insensitive exact match wins; otherwise the duplicates, or up to five substring matches, are the candidates. */
  static pickUniqueEntry<Entry extends Named<number | string>>(label: string, query: string, entries: Entry[]): Entry {
    const q = query.trim().toLowerCase();
    const exact = entries.filter((entry) => entry.name.trim().toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const candidates: Candidate[] = (exact.length > 1
      ? exact
      : entries.filter((entry) => entry.name.trim().toLowerCase().includes(q)).slice(0, 5)
    ).map((entry) => ({ id: entry.id, name: entry.name }));
    throw new ResolutionError(label, query, candidates);
  }

  /** The entry an id or a name denotes: an id matches exactly one entry; anything else is matched as a name. */
  static pickEntry<Entry extends Named<number | string>>(label: string, query: string, entries: Entry[]): Entry {
    const trimmed = query.trim();
    return entries.find((entry) => String(entry.id) === trimmed) ?? Resolver.pickUniqueEntry(label, trimmed, entries);
  }

  /** The cached entries of a list kind in a scope (a search kind would get the empty query). */
  async list<K extends KindName>({ kind, scope = {} }: ListOptions<K>): Promise<EntryOf<K>[]> {
    return this.load(kind, scope, "");
  }

  /** The entry a name or an id denotes — the whole thing, for callers that need more than the id. Always loads. */
  async find<K extends KindName>({ kind, value, scope = {} }: ResolveOptions<K>): Promise<EntryOf<K>> {
    const query = String(value).trim();
    const entries = await this.load(kind, scope, query);
    return Resolver.pickEntry(kinds[kind].label, query, entries);
  }

  /** The id a name or an id denotes. An id of the kind's shape passes through without a load. */
  async resolve<K extends KindName>({ kind, value, scope = {} }: ResolveOptions<K>): Promise<IdOf<K>> {
    const id = Resolver.asId(kinds[kind].shape, value);
    // asId returns the id type the shape declares, and the table ties each kind's shape to its entry's id.
    if (id !== null) return id as IdOf<K>;
    return (await this.find({ kind, value, scope })).id;
  }

  /**
   * Called by a write tool for every kind its write dirtied, so the next name lookup re-reads.
   * Drops every cache family the kind owns (a column drops both its families; a board also drops
   * its project's column aggregate; a search kind drops every cached query). Never throws.
   */
  forget({ kind, scope = {} }: ForgetOptions): void {
    for (const prefix of kinds[kind].forgetPrefixes(scope)) this.cache.invalidatePrefix(prefix);
  }

  private async load<K extends KindName>(kind: K, scope: ResolveScope, query: string): Promise<EntryOf<K>[]> {
    const kindDefinition: Kind = kinds[kind];
    const key = Resolver.cacheKeyFor(kindDefinition, scope, query);
    const entries = await this.cache.get<Array<Named<number | string>>>(key, () => kindDefinition.load(this.client, scope, query));
    // The cache is untyped (FOLLOWUPS #3); the kind that loaded a key is the only one that reads it.
    return entries as unknown as EntryOf<K>[];
  }

  private static cacheKeyFor(kindDefinition: Kind, scope: ResolveScope, query: string): string {
    const prefix = kindDefinition.cacheKey(scope);
    if (kindDefinition.strategy === "list") return prefix;
    if (kindDefinition.strategy === "search") return `${prefix}:${query.toLowerCase()}`;
    const _exhaustive: never = kindDefinition.strategy;
    throw new Error(`unhandled load strategy ${String(_exhaustive)}`);
  }

  private static asId(shape: IdShape, value: string | number): number | string | null {
    if (shape === "integer") {
      if (typeof value === "number") return value;
      return INTEGER_RE.test(value.trim()) ? Number(value.trim()) : null;
    }
    if (shape === "uuid") {
      if (typeof value === "number") return String(value);
      return UUID_RE.test(value.trim()) ? value.trim() : null;
    }
    if (shape === "opaque") return null;
    const _exhaustive: never = shape;
    throw new Error(`unhandled id shape ${String(_exhaustive)}`);
  }
}
