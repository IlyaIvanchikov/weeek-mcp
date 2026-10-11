import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./shared.js";
import type { NamedEntity } from "./types.js";

export class ProjectsApi {
  constructor(private http: HttpClient) {}
  async list(): Promise<NamedEntity[]> {
    const j = await this.http.execute<Record<string, unknown>>(operations.projects.list);
    return pickArray(j, "projects").map(toNamed);
  }
}
