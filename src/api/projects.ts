import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import { apiFlag } from "./requests.js";
import { projectStatuses } from "./constants.js";
import type { NewProject, Project, ProjectStatus, ProjectUpdate, SuccessResponse } from "./types.js";

export interface UpdateProjectOptions { projectId: number; update: ProjectUpdate; }
export interface SetArchivedOptions { projectId: number; archived: boolean; }

const ops = operations.projects;

export function toProject(raw: any): Project {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    description: raw.description == null ? null : String(raw.description),
    color: raw.color == null ? null : String(raw.color),
    status: (projectStatuses as readonly number[]).includes(raw.status) ? (raw.status as ProjectStatus) : null,
    isPrivate: Boolean(raw.isPrivate),
    portfolioId: raw.portfolioId == null ? null : Number(raw.portfolioId),
    team: Array.isArray(raw.team) ? raw.team.map(String) : [],
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
