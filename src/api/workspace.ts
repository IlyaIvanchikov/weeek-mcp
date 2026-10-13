import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toMember } from "./responses.js";
import type { Member, Workspace } from "./types.js";

export class WorkspaceApi {
  constructor(private http: HttpClient) {}
  async listMembers(): Promise<Member[]> {
    const json = await this.http.execute<Record<string, unknown>>(operations.workspace.listMembers);
    return pickArray(json, "members").map(toMember);
  }

  async get(): Promise<Workspace> {
    const json = await this.http.execute<{ workspace: any }>(operations.workspace.get);
    const raw = json.workspace ?? {};
    return { id: Number(raw.id), title: String(raw.title ?? ""), description: raw.description == null ? null : String(raw.description), isPersonal: Boolean(raw.isPersonal) };
  }
}
