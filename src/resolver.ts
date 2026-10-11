import type { WeeekClient } from "./client.js";
import type { NameCache } from "./cache.js";
import { ResolutionError, type Candidate } from "./errors.js";

export const idShapes = ["integer", "uuid"] as const;
export type IdShape = (typeof idShapes)[number];

export interface Named<Id extends number | string> { id: Id; name: string; }
export interface ResolveScope { projectId?: number; boardId?: number; }

/** What the resolver needs to know about one kind of named thing. */
interface Kind<Id extends number | string> {
  /** How an id looks, so one can be passed straight through instead of looked up. */
  shape: IdShape;
  /** The word used in error messages — the tool parameter's name, not the API's. */
  label: string;
  /** Cache key; must include every scope id the load depends on. */
  key(scope: ResolveScope): string;
  load(client: WeeekClient, scope: ResolveScope): Promise<Array<Named<Id>>>;
}

interface KindTable {
  project: Kind<number>;
  board: Kind<number>;
  column: Kind<number>;
  member: Kind<string>;
}
export type KindName = keyof KindTable;
type IdOf<K extends KindName> = KindTable[K] extends Kind<infer Id> ? Id : never;

export interface ResolveOptions<K extends KindName> {
  kind: K;
  value: string | number;
  scope?: ResolveScope;
}

const INTEGER_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireScope<T>(value: T | undefined, label: string, field: string): T {
  if (value === undefined) throw new Error(`resolving a ${label} by name needs ${field}`);
  return value;
}

// Only small, workspace-scoped lists belong here (the API has no filter for them). Kinds
// the API can search server-side arrive in later phases with a "search" load.
const kinds: KindTable = {
  project: {
    shape: "integer", label: "project",
    key: () => "projects",
    load: (client) => client.projects.list(),
  },
  board: {
    shape: "integer", label: "board",
    key: (scope) => `boards:${requireScope(scope.projectId, "board", "projectId")}`,
    load: (client, scope) => client.boards.list(requireScope(scope.projectId, "board", "projectId")),
  },
  column: {
    shape: "integer", label: "column",
    key: (scope) => scope.boardId !== undefined
      ? `board-columns:${scope.boardId}`
      : `columns:${requireScope(scope.projectId, "column", "boardId or projectId")}`,
    load: async (client, scope) => {
      if (scope.boardId !== undefined) return client.columns.list(scope.boardId);
      const boards = await client.boards.list(requireScope(scope.projectId, "column", "boardId or projectId"));
      const all: Named<number>[] = [];
      for (const board of boards) all.push(...(await client.columns.list(board.id)));
      return all;
    },
  },
  member: {
    shape: "uuid", label: "assignee",
    key: () => "members",
    load: (client) => client.workspace.listMembers(),
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
    const definition = kinds[kind] as Kind<IdOf<K>>;
    const id = Resolver.asId(definition.shape, value);
    if (id !== null) return id as IdOf<K>;
    const list = await this.cache.get(definition.key(scope), () => definition.load(this.client, scope));
    return Resolver.pickUnique<IdOf<K>>(definition.label, String(value), list);
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
