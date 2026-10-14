import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { asRecord, isOneOf, pickArray } from "./responses.js";
import { apiFlag } from "./requests.js";
import { projectStatuses } from "./constants.js";
import { toCustomField } from "./custom-fields.js";
import type { NewProject, Project, ProjectUpdate, SuccessResponse } from "./types.js";

export interface UpdateProjectOptions { projectId: number; update: ProjectUpdate; }
export interface SetArchivedOptions { projectId: number; archived: boolean; }

const ops = operations.projects;

export function toProject(raw: unknown): Project {
  const r = asRecord(raw);
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    description: r.description == null ? null : String(r.description),
    color: r.color == null ? null : String(r.color),
    status: isOneOf(projectStatuses, r.status) ? r.status : null,
    isPrivate: Boolean(r.isPrivate),
    portfolioId: r.portfolioId == null ? null : Number(r.portfolioId),
    team: Array.isArray(r.team) ? r.team.map(String) : [],
    customFields: Array.isArray(r.customFields) ? r.customFields.map(toCustomField) : [],
  };
}

export class ProjectsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Project[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list);
    return pickArray(json, "projects").map(toProject);
  }

  async get(projectId: number): Promise<Project> {
    const json = await this.http.execute<{ project: unknown }>(ops.get, { params: { projectId } });
    return toProject(json.project);
  }

  async create(newProject: NewProject): Promise<Project> {
    const body: Record<string, unknown> = { name: newProject.name, isPrivate: apiFlag(newProject.isPrivate) };
    if (newProject.description !== undefined) body.description = newProject.description;
    if (newProject.portfolioId !== undefined) body.portfolioId = newProject.portfolioId;
    const json = await this.http.execute<{ project: unknown }>(ops.create, { body });
    return toProject(json.project);
  }

  // PUT answers with success only, so the project is re-read.
  async update({ projectId, update }: UpdateProjectOptions): Promise<Project> {
    const body: Record<string, unknown> = { name: update.name, isPrivate: apiFlag(update.isPrivate) };
    if (update.color !== undefined) body.color = update.color;
    await this.http.execute<SuccessResponse>(ops.update, { params: { projectId }, body });
    return this.get(projectId);
  }

  async remove(projectId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { projectId } });
  }

  async setArchived({ projectId, archived }: SetArchivedOptions): Promise<Project> {
    await this.http.execute<SuccessResponse>(archived ? ops.archive : ops.unarchive, { params: { projectId } });
    return this.get(projectId);
  }
}
