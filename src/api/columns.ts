import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { BoardColumn, NewColumn, SuccessResponse } from "./types.js";

export interface UpdateColumnOptions { columnId: number; name: string; }
/** `upperColumnId` is the column to place this one after; null puts it first. */
export interface MoveColumnOptions { columnId: number; upperColumnId: number | null; }

const ops = operations.columns;

export function toColumn(raw: any): BoardColumn {
  return { id: Number(raw.id), name: String(raw.name ?? ""), boardId: Number(raw.boardId) };
}

export class ColumnsApi {
  constructor(private http: HttpClient) {}

  async list(boardId: number): Promise<BoardColumn[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query: { boardId } });
    return pickArray(json, "boardColumns").map(toColumn);
  }

  async create(newColumn: NewColumn): Promise<BoardColumn> {
    const json = await this.http.execute<{ boardColumn: unknown }>(ops.create, { body: newColumn });
    return toColumn(json.boardColumn);
  }

  // No GET /tm/board-columns/{id} exists, so these return the API's envelope rather than a re-read.
  async update({ columnId, name }: UpdateColumnOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.update, { params: { columnId }, body: { name } });
  }

  async remove(columnId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { columnId } });
  }

  async move({ columnId, upperColumnId }: MoveColumnOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.move, { params: { columnId }, body: { upperBoardColumnId: upperColumnId } });
  }
}
