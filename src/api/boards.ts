import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./shared.js";
import type { NamedEntity } from "./types.js";

export class BoardsApi {
  constructor(private http: HttpClient) {}
  async list(projectId: number): Promise<NamedEntity[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.boards.list, { query: { projectId } });
    return pickArray(j, "boards").map(toNamed);
  }
}
