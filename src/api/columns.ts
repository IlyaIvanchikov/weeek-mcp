import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./shared.js";
import type { NamedEntity } from "./types.js";

export class ColumnsApi {
  constructor(private http: HttpClient) {}
  async list(boardId: number): Promise<NamedEntity[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.columns.list, { query: { boardId } });
    return pickArray(j, "boardColumns").map(toNamed);
  }
}
