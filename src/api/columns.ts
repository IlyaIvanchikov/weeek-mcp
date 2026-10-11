import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./responses.js";
import type { NamedEntity } from "./types.js";

export class ColumnsApi {
  constructor(private http: HttpClient) {}
  async list(boardId: number): Promise<NamedEntity[]> {
    const json = await this.http.execute<Record<string, unknown>>(operations.columns.list, { query: { boardId } });
    return pickArray(json, "boardColumns").map(toNamed);
  }
}
