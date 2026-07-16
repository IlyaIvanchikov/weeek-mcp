import type { WeeekClient, NamedEntity, Member } from "./client.js";
import type { NameCache } from "./cache.js";
import { ResolutionError, type Candidate } from "./errors.js";

function asId(value: string | number): number | null {
  if (typeof value === "number") return value;
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Resolver {
  constructor(private client: WeeekClient, private cache: NameCache) {}

  static pickUnique<I extends number | string>(kind: string, query: string, list: Array<{ id: I; name: string }>): I {
    const q = query.trim().toLowerCase();
    const exact = list.filter((e) => e.name.trim().toLowerCase() === q);
    if (exact.length === 1) return exact[0].id;
    const candidates: Candidate[] = (exact.length > 1
      ? exact
      : list.filter((e) => e.name.trim().toLowerCase().includes(q)).slice(0, 5)
    ).map((e) => ({ id: e.id, name: e.name }));
    throw new ResolutionError(kind, query, candidates);
  }

  async resolveProject(value: string | number): Promise<number> {
    const id = asId(value);
    if (id !== null) return id;
    const list = await this.cache.get("projects", () => this.client.listProjects());
    return Resolver.pickUnique<number>("project", String(value), list);
  }

  async resolveColumn(projectId: number, value: string | number): Promise<number> {
    const id = asId(value);
    if (id !== null) return id;
    const list = await this.cache.get(`columns:${projectId}`, async () => {
      const boards = await this.client.listBoards(projectId);
      const all: NamedEntity[] = [];
      for (const b of boards) all.push(...(await this.client.listColumns(b.id)));
      return all;
    });
    return Resolver.pickUnique<number>("column", String(value), list);
  }

  async resolveColumnInBoard(boardId: number, value: string | number): Promise<number> {
    const id = asId(value);
    if (id !== null) return id;
    const list = await this.cache.get(`board-columns:${boardId}`, () => this.client.listColumns(boardId));
    return Resolver.pickUnique<number>("column", String(value), list);
  }

  async resolveAssignee(value: string | number): Promise<string> {
    if (typeof value === "number") return String(value);
    const v = value.trim();
    if (UUID_RE.test(v)) return v; // real WEEEK user-id passthrough
    const list: Member[] = await this.cache.get("members", () => this.client.listMembers());
    return Resolver.pickUnique<string>("assignee", value, list);
  }
}
