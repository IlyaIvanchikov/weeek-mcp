import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { asRecord, pickArray } from "./responses.js";
import type { Board, NewBoard, SuccessResponse } from "./types.js";

export interface UpdateBoardOptions { boardId: number; name: string; }
/** `upperBoardId` is the board to place this one after; null puts it first. */
export interface MoveBoardOptions { boardId: number; upperBoardId: number | null; }

const ops = operations.boards;

export function toBoard(raw: unknown): Board {
  const r = asRecord(raw);
  return { id: Number(r.id), name: String(r.name ?? ""), projectId: Number(r.projectId), isPrivate: Boolean(r.isPrivate) };
}

export class BoardsApi {
  constructor(private http: HttpClient) {}

  async list(projectId: number): Promise<Board[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query: { projectId } });
    return pickArray(json, "boards").map(toBoard);
  }

  async create(newBoard: NewBoard): Promise<Board> {
    const json = await this.http.execute<{ board: unknown }>(ops.create, { body: newBoard });
    return toBoard(json.board);
  }

  // No GET /tm/boards/{id} exists, so these return the API's envelope rather than a re-read.
  async update({ boardId, name }: UpdateBoardOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.update, { params: { boardId }, body: { name } });
  }

  async remove(boardId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { boardId } });
  }

  async move({ boardId, upperBoardId }: MoveBoardOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.move, { params: { boardId }, body: { upperBoardId } });
  }
}
