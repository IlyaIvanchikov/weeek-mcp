import type { WeeekClient } from "./client.js";
import type { NameCache } from "./cache.js";
import { ResolutionError, type Candidate } from "./errors.js";

export const idShapes = ["integer", "uuid"] as const;
export type IdShape = (typeof idShapes)[number];
export const loadStrategies = ["list", "search"] as const;
export type LoadStrategy = (typeof loadStrategies)[number];

// A server-side search is never paged in full: this many candidates is plenty to pick one
// exact match from or to show as suggestions.
const searchPageSize = 50;

export interface Named<Id extends number | string> { id: Id; name: string; }
export interface ResolveScope { projectId?: number; boardId?: number; }

/** What the resolver needs to know about one kind of named thing. */
interface KindBase<Id extends number | string> {
  /** The word used in error messages — the tool parameter's name, not the API's. */
  label: string;
  /** "list" loads the whole (small) collection once; "search" asks the API for the query and caches per query. */
  strategy: LoadStrategy;
  /** Cache prefix; must include every scope id the load depends on. A search kind caches under `${prefix}:${query}`. */
  cacheKey(scope: ResolveScope): string;
  load(client: WeeekClient, scope: ResolveScope, query: string): Promise<Array<Named<Id>>>;
  /**
   * Every cache prefix a write to this kind makes stale. Never throws: a missing scope widens
   * to the bare prefixes (drop more, re-read once) instead of failing the write that called it.
   */
  forgetPrefixes(scope: ResolveScope): string[];
}
// The shape names the id type, so a kind cannot declare uuid ids and load numeric ones.
interface IntegerKind extends KindBase<number> { shape: "integer"; }
interface UuidKind extends KindBase<string> { shape: "uuid"; }
type Kind = IntegerKind | UuidKind;

interface KindTable {
  project: IntegerKind;
  board: IntegerKind;
  column: IntegerKind;
  member: UuidKind;
  tag: IntegerKind;
  portfolio: IntegerKind;
}
export type KindName = keyof KindTable;
type IdOf<K extends KindName> = KindTable[K] extends IntegerKind ? number : string;

export interface ResolveOptions<K extends KindName> {
  kind: K;
  value: string | number;
  scope?: ResolveScope;
}
export interface ForgetOptions { kind: KindName; scope?: ResolveScope; }

const INTEGER_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireScope<T>(value: T | undefined, label: string, field: string): T {
  if (value === undefined) throw new Error(`resolving a ${label} by name needs ${field}`);
  return value;
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
    cacheKey: (scope) => `boards:${requireScope(scope.projectId, "board", "projectId")}`,
    // The project-wide column aggregate is built from the boards, so a board write dirties it too.
    forgetPrefixes: ({ projectId }) => projectId !== undefined
      ? [`boards:${projectId}`, `columns:${projectId}`]
      : ["boards", "columns"],
    load: (client, scope) => client.boards.list(requireScope(scope.projectId, "board", "projectId")),
  },
  column: {
    shape: "integer", label: "column", strategy: "list",
    cacheKey: (scope) => scope.boardId !== undefined
      ? `board-columns:${scope.boardId}`
      : `columns:${requireScope(scope.projectId, "column", "boardId or projectId")}`,
    // A boardId cannot be mapped to its project without a fetch, so both families go entirely.
    forgetPrefixes: () => ["board-columns", "columns"],
    load: async (client, scope) => {
      if (scope.boardId !== undefined) return client.columns.list(scope.boardId);
      const boards = await client.boards.list(requireScope(scope.projectId, "column", "boardId or projectId"));
      const all: Named<number>[] = [];
      for (const board of boards) all.push(...(await client.columns.list(board.id)));
      return all;
    },
  },
  member: {
    shape: "uuid", label: "assignee", strategy: "list",
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
    load: async (client, _scope, query) => (await client.portfolios.list({ search: query, limit: searchPageSize })).portfolios,
  },
};

export class Resolver {
  constructor(private client: WeeekClient, private cache: NameCache) {}

  static pickUnique<I extends number | string>(kind: string, query: string, list: Array<Named<I>>): I {
    const q = query.trim().toLowerCase();
    const exact = list.filter((e) => e.name.trim().toLowerCase() === q);
    if (exact.length === 1) return exact[0].id;
    const candidates: Candidate[] = (exact.length > 1
      ? exact
      : list.filter((e) => e.name.trim().toLowerCase().includes(q)).slice(0, 5)
    ).map((e) => ({ id: e.id, name: e.name }));
    throw new ResolutionError(kind, query, candidates);
  }

  async resolve<K extends KindName>({ kind, value, scope = {} }: ResolveOptions<K>): Promise<IdOf<K>> {
    const definition: Kind = kinds[kind];
    const id = Resolver.asId(definition.shape, value);
    if (id !== null) return id as IdOf<K>;
    const query = String(value).trim();
    const key = Resolver.cacheKeyFor(definition, scope, query);
    const list = (await this.cache.get<Array<Named<number | string>>>(key, () => definition.load(this.client, scope, query))) as unknown as Array<Named<IdOf<K>>>;
    return Resolver.pickUnique<IdOf<K>>(definition.label, query, list);
  }

  /**
   * Called by a write tool for every kind its write dirtied, so the next name lookup re-reads.
   * Drops every cache family the kind owns (a column drops both its families; a board also drops
   * its project's column aggregate; a search kind drops every cached query). Never throws.
   */
  forget({ kind, scope = {} }: ForgetOptions): void {
    for (const prefix of kinds[kind].forgetPrefixes(scope)) this.cache.invalidatePrefix(prefix);
  }

  private static cacheKeyFor(definition: Kind, scope: ResolveScope, query: string): string {
    const prefix = definition.cacheKey(scope);
    if (definition.strategy === "list") return prefix;
    if (definition.strategy === "search") return `${prefix}:${query.toLowerCase()}`;
    const _exhaustive: never = definition.strategy;
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
    const _exhaustive: never = shape;
    throw new Error(`unhandled id shape ${String(_exhaustive)}`);
  }
}
