import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray, toNamed } from "./responses.js";
import type { NamedEntity } from "./types.js";

export class ProjectsApi {
  constructor(private http: HttpClient) {}
  async list(): Promise<NamedEntity[]> {
    const json = await this.http.execute<Record<string, unknown>>(operations.projects.list);
    return pickArray(json, "projects").map(toNamed);
  }
}
