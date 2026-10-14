import { HttpClient, type HttpConfig } from "./http.js";
import { TasksApi } from "./api/tasks.js";
import { ProjectsApi } from "./api/projects.js";
import { BoardsApi } from "./api/boards.js";
import { ColumnsApi } from "./api/columns.js";
import { WorkspaceApi } from "./api/workspace.js";
import { AttachmentsApi } from "./api/attachments.js";
import { UserApi } from "./api/user.js";
import { TagsApi } from "./api/tags.js";
import { PortfoliosApi } from "./api/portfolios.js";
import { CustomFieldsApi } from "./api/custom-fields.js";
import { FunnelsApi } from "./api/crm/funnels.js";

export type * from "./api/types.js";

/**
 * One client per API area, sharing one HttpClient. Resource clients hold the per-endpoint
 * knowledge; this class only wires them, so it stays this size as the API grows.
 */
export class WeeekClient {
  readonly tasks: TasksApi;
  readonly projects: ProjectsApi;
  readonly boards: BoardsApi;
  readonly columns: ColumnsApi;
  readonly workspace: WorkspaceApi;
  readonly attachments: AttachmentsApi;
  readonly user: UserApi;
  readonly tags: TagsApi;
  readonly portfolios: PortfoliosApi;
  readonly customFields: CustomFieldsApi;
  /** CRM clients; Phase 3 carries only what custom fields need. */
  readonly crm: { funnels: FunnelsApi };

  constructor(cfg: HttpConfig, fetchImpl: typeof fetch = fetch) {
    const http = new HttpClient(cfg, fetchImpl);
    this.tasks = new TasksApi(http);
    this.projects = new ProjectsApi(http);
    this.boards = new BoardsApi(http);
    this.columns = new ColumnsApi(http);
    this.workspace = new WorkspaceApi(http);
    this.attachments = new AttachmentsApi(http);
    this.user = new UserApi(http);
    this.tags = new TagsApi(http);
    this.portfolios = new PortfoliosApi(http);
    this.crm = { funnels: new FunnelsApi(http) };
    this.customFields = new CustomFieldsApi(http, { projects: this.projects, tasks: this.tasks, funnels: this.crm.funnels });
  }
}
