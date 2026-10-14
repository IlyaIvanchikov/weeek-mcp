import type { HttpClient, PathParams } from "../http.js";
import { operations, type Operation } from "../operations.js";
import { asRecord, isOneOf, pickArray } from "./responses.js";
import { booleanStyles, fieldTypes, numberFormats } from "./constants.js";
import type { ProjectsApi } from "./projects.js";
import type { TasksApi } from "./tasks.js";
import type { FunnelsApi } from "./crm/funnels.js";
import type {
  CustomField, CustomFieldOption, CustomFieldUpdate, FieldConfig, FieldScope, NewCustomField, NewFieldOption,
  NumberFieldConfig, Placement, SuccessResponse, TransferTarget,
} from "./types.js";

export interface FieldRef { scope: FieldScope; fieldId: string; }
export interface CreateFieldOptions { scope: FieldScope; field: NewCustomField; }
export interface UpdateFieldOptions extends FieldRef { update: CustomFieldUpdate; }
export interface TransferFieldOptions extends FieldRef { target: TransferTarget; }
export interface MoveFieldOptions { funnelId: string; fieldId: string; placement: Placement; }
export interface CreateOptionOptions extends FieldRef { option: NewFieldOption; }
export interface OptionRef extends FieldRef { optionId: string; }
export interface UpdateOptionOptions extends OptionRef { option: NewFieldOption; }
export interface MoveOptionOptions extends OptionRef { placement: Placement; }

/** The clients the board and funnel scopes are read through; the API has no list of its own for them. */
export interface FieldSources { projects: Pick<ProjectsApi, "get">; tasks: Pick<TasksApi, "sampleBoardFields">; funnels: Pick<FunnelsApi, "list">; }

export const globalScope: FieldScope = { kind: "global" };

export function toFieldOption(raw: unknown): CustomFieldOption {
  const r = asRecord(raw);
  return { id: String(r.id ?? ""), name: String(r.name ?? ""), color: String(r.color ?? "") };
}

function toFieldConfig(raw: unknown): FieldConfig | null {
  const r = asRecord(raw);
  if (isOneOf(numberFormats, r.type)) {
    const config: NumberFieldConfig = { type: r.type, precision: r.precision == null ? null : Number(r.precision) };
    if (r.currency != null) config.currency = Number(r.currency);
    return config;
  }
  if (isOneOf(booleanStyles, r.type)) return { type: r.type };
  return null;
}

export function toCustomField(raw: unknown): CustomField {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    type: isOneOf(fieldTypes, r.type) ? r.type : null,
    config: toFieldConfig(r.config),
    // Never pickArray here: a task's field sits beside other arrays, and the fallback would pick one of them.
    options: Array.isArray(r.options) ? r.options.map(toFieldOption) : [],
  };
}

// The route members every scope has. The four groups in src/operations.ts share these names on
// purpose; typed as Operation, not as one group's literal paths, so every group fits.
type ScopedRoutes = Record<"create" | "update" | "remove" | "createOption" | "updateOption" | "removeOption" | "moveOption", Operation>;
type TransferRoutes = Record<"transferToGlobal" | "transferToProject" | "transferToBoard", Operation>;
interface ScopeRouting { routes: ScopedRoutes; params: PathParams; }

function routingOf(scope: FieldScope): ScopeRouting {
  switch (scope.kind) {
    case "global": return { routes: operations.globalFields, params: {} };
    case "project": return { routes: operations.projectFields, params: { projectId: scope.projectId } };
    case "board": return { routes: operations.boardFields, params: { boardId: scope.boardId } };
    case "funnel": return { routes: operations.funnelFields, params: { funnelId: scope.funnelId } };
    default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
  }
}

interface TransferRoute { operation: Operation; body?: Record<string, number>; }

function scopedTransfer(routes: TransferRoutes, target: TransferTarget): TransferRoute {
  switch (target.kind) {
    case "global": return { operation: routes.transferToGlobal };
    case "project": return { operation: routes.transferToProject, body: { projectId: target.projectId } };
    case "board": return { operation: routes.transferToBoard, body: { boardId: target.boardId } };
    default: { const _exhaustive: never = target; throw new Error(`unhandled transfer target ${String(_exhaustive)}`); }
  }
}

function transferRoute(scope: FieldScope, target: TransferTarget): TransferRoute {
  switch (scope.kind) {
    case "funnel": throw new Error("a funnel's custom fields stay in their funnel; move reorders them instead");
    case "global":
      switch (target.kind) {
        case "global": throw new Error("the field is already global");
        case "project": return { operation: operations.globalFields.transferToProject, body: { projectId: target.projectId } };
        case "board": return { operation: operations.globalFields.transferToBoard, body: { boardId: target.boardId } };
        default: { const _exhaustive: never = target; throw new Error(`unhandled transfer target ${String(_exhaustive)}`); }
      }
    case "project":
      if (target.kind === "project" && target.projectId === scope.projectId) throw new Error("the field is already in that project");
      return scopedTransfer(operations.projectFields, target);
    case "board":
      if (target.kind === "board" && target.boardId === scope.boardId) throw new Error("the field is already in that board");
      return scopedTransfer(operations.boardFields, target);
    default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
  }
}

export class CustomFieldsApi {
  constructor(private http: HttpClient, private sources: FieldSources) {}

  /**
   * The fields of one scope. Global, project and funnel fields are listed by the API; a board's
   * are not listed anywhere, so they are read off a page of the board's tasks (the fields all of
   * them carry) minus the global fields and the fields of every project those tasks sit in.
   * A board without tasks lists nothing.
   */
  async list(scope: FieldScope): Promise<CustomField[]> {
    switch (scope.kind) {
      case "global": {
        const json = await this.http.execute<Record<string, unknown>>(operations.globalFields.list);
        return pickArray(json, "data").map(toCustomField);
      }
      case "project": return (await this.sources.projects.get(scope.projectId)).customFields;
      case "funnel": {
        const funnel = (await this.sources.funnels.list()).find((candidate) => candidate.id === scope.funnelId);
        if (!funnel) throw new Error(`funnel ${scope.funnelId} not found`);
        return funnel.customFields;
      }
      case "board": {
        const sample = await this.sources.tasks.sampleBoardFields(scope.boardId);
        if (sample === null) return [];
        const projectLists = await Promise.all(sample.projectIds.map((projectId) => this.list({ kind: "project", projectId })));
        const inherited = new Set([...(await this.list(globalScope)), ...projectLists.flat()].map((field) => field.id));
        return sample.fields.filter((field) => !inherited.has(field.id));
      }
      default: { const _exhaustive: never = scope; throw new Error(`unhandled field scope ${String(_exhaustive)}`); }
    }
  }

  async create({ scope, field }: CreateFieldOptions): Promise<CustomField> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ customField: unknown }>(routes.create, { params, body: field });
    return toCustomField(json.customField);
  }

  async update({ scope, fieldId, update }: UpdateFieldOptions): Promise<CustomField> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ customField: unknown }>(routes.update, { params: { ...params, fieldId }, body: update });
    return toCustomField(json.customField);
  }

  async remove({ scope, fieldId }: FieldRef): Promise<SuccessResponse> {
    const { routes, params } = routingOf(scope);
    return this.http.execute<SuccessResponse>(routes.remove, { params: { ...params, fieldId } });
  }

  async transfer({ scope, fieldId, target }: TransferFieldOptions): Promise<SuccessResponse> {
    const { operation, body } = transferRoute(scope, target);
    return this.http.execute<SuccessResponse>(operation, { params: { ...routingOf(scope).params, fieldId }, body });
  }

  /** Only funnel fields have an order the API exposes. */
  async move({ funnelId, fieldId, placement }: MoveFieldOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(operations.funnelFields.move, { params: { funnelId, fieldId }, body: placement });
  }

  async createOption({ scope, fieldId, option }: CreateOptionOptions): Promise<CustomFieldOption> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ option: unknown }>(routes.createOption, { params: { ...params, fieldId }, body: option });
    return toFieldOption(json.option);
  }

  async updateOption({ scope, fieldId, optionId, option }: UpdateOptionOptions): Promise<CustomFieldOption> {
    const { routes, params } = routingOf(scope);
    const json = await this.http.execute<{ option: unknown }>(routes.updateOption, { params: { ...params, fieldId, optionId }, body: option });
    return toFieldOption(json.option);
  }

  async removeOption({ scope, fieldId, optionId }: OptionRef): Promise<SuccessResponse> {
    const { routes, params } = routingOf(scope);
    return this.http.execute<SuccessResponse>(routes.removeOption, { params: { ...params, fieldId, optionId } });
  }

  async moveOption({ scope, fieldId, optionId, placement }: MoveOptionOptions): Promise<SuccessResponse> {
    const { routes, params } = routingOf(scope);
    return this.http.execute<SuccessResponse>(routes.moveOption, { params: { ...params, fieldId, optionId }, body: placement });
  }
}
