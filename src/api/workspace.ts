import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toMember } from "./shared.js";
import type { Member } from "./types.js";

export class WorkspaceApi {
  constructor(private http: HttpClient) {}
  async listMembers(): Promise<Member[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.workspace.listMembers);
    return pickArray(j, "members").map(toMember);
  }
}
