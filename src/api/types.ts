import type { BinaryResponse } from "../http.js";
import type { attachmentServices, booleanStyles, fieldScopes, fieldTypes, numberFormats, optionColors, projectStatuses, taskPriorities, taskTypes, transferTargetKinds } from "./constants.js";

/** What an endpoint answers when it returns no entity, only the success flag. */
export interface SuccessResponse { success: boolean; }

export interface Member { id: string; name: string; }

export type AttachmentService = (typeof attachmentServices)[number];

export interface Attachment {
  id: string;
  creatorId: string;
  service: AttachmentService;
  name: string;
  /** Temporary URL. When `service` is "weeek" it is valid for one hour. */
  url: string;
  /** Present only when `service` is "weeek". */
  size?: number;
  createdAt: string;
}

/** What an attachment download yields — the HTTP layer's binary response, under the name the API layer uses. */
export type AttachmentBytes = BinaryResponse;
export interface DownloadAttachmentOptions { attachment: Attachment; maxBytes: number; }

export type TaskPriority = (typeof taskPriorities)[number];
export type TaskType = (typeof taskTypes)[number];
/** A wire priority is an index into taskPriorities (0 low … 3 hold); derived from the tuple so the two cannot drift. */
export type TaskPriorityCode = Exclude<Partial<typeof taskPriorities>["length"], (typeof taskPriorities)["length"]>;

export interface TaskLocation { projectId: number; boardId: number | null; boardColumnId: number | null; }

export interface TimeEntry {
  id: string;
  userId: string;
  /** `Y-m-d`. */
  date: string;
  /** Minutes; the API caps it at 1440. */
  duration: number;
  isOvertime: boolean;
  comment: string;
}

/** What the API needs to record time: a PUT replaces all four, so an update sends all four too. */
export interface TimeEntryFields { userId: string; date: string; duration: number; isOvertime: boolean; }

export interface TaskComment {
  id: number;
  parentId: number | null;
  authorId: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}
export interface CommentsPage { comments: TaskComment[]; hasMore: boolean; }

export interface WeeekTask {
  id: number; title: string; description: string | null;
  projectId: number | null; boardId: number | null; boardColumnId: number | null;
  parentId: number | null; subTasks: number[];
  assignees: string[]; watchers: string[]; authorId: string | null;
  priority: TaskPriority | null; type: TaskType | null;
  startDate: string | null; dueDate: string | null;
  completed: boolean; completedAt: string | null; createdAt: string | null;
  /** Time estimate, in minutes. */
  duration: number | null;
  tags: number[];
  locations: TaskLocation[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
  customFields: CustomFieldValue[];
}

export interface NewTask {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
  /** Wire code; use priorityCode() to build it from a name. */
  priority?: TaskPriorityCode;
  type?: TaskType;
  parentId?: number;
  /** Field ids to wire values; built by encodeFieldValues. */
  customFields?: Record<string, unknown>;
}

export type ProjectStatus = (typeof projectStatuses)[number];

export interface Project {
  id: number; name: string; description: string | null; color: string | null;
  status: ProjectStatus | null; isPrivate: boolean; portfolioId: number | null;
  /** Member ids. */
  team: string[];
  /** The project's own fields; global ones are not repeated here. */
  customFields: CustomField[];
}
/** What weeek_list_projects returns; description and team come from weeek_get_project. */
export type ProjectSummary = Pick<Project, "id" | "name" | "isPrivate" | "status" | "portfolioId">;
export interface NewProject { name: string; isPrivate: boolean; description?: string; portfolioId?: number; }
/** PUT /tm/projects/{id} replaces: the API requires name and isPrivate even when unchanged. */
export interface ProjectUpdate { name: string; isPrivate: boolean; color?: string; }

export interface Board { id: number; name: string; projectId: number; isPrivate: boolean; }
export interface NewBoard { name: string; projectId: number; }

export interface BoardColumn { id: number; name: string; boardId: number; }
export interface NewColumn { name: string; boardId: number; }

export interface Tag { id: number; title: string; color: string; }
export interface NewTag { title: string; }
/** PUT /ws/tags/{id} replaces both fields. */
export interface TagUpdate { title: string; color: string; }

export interface Portfolio { id: number; name: string; parentId: number | null; isPrivate: boolean; }
// A type alias, not an interface, so it is assignable to HttpClient's Query index signature.
export type PortfolioQuery = { search?: string; parentId?: number; limit?: number; offset?: number };
export interface PortfolioPage { portfolios: Portfolio[]; hasMore: boolean; }
export interface NewPortfolio { name: string; parentId?: number; }

export interface Workspace { id: number; title: string; description: string | null; isPersonal: boolean; }

/** The token owner, as GET /user/me reports it. `name` is joined the way members' names are. */
export interface Profile { id: string; name: string; email: string; language: string | null; timeZone: string | null; }

export type FieldType = (typeof fieldTypes)[number];
export type OptionColor = (typeof optionColors)[number];
export type NumberFormat = (typeof numberFormats)[number];
export type BooleanStyle = (typeof booleanStyles)[number];

/** A number field's settings as the API spells them; `currency` is a WEEEK currency id (1–10; GET /crm/currencies names them in Phase 4). */
export interface NumberFieldConfig { type: NumberFormat; precision: number | null; currency?: number; }
export interface BooleanFieldConfig { type: BooleanStyle; }
/** Only number and boolean fields carry settings; the two are told apart by `type`. */
export type FieldConfig = NumberFieldConfig | BooleanFieldConfig;

/** What a caller may pass for one field, and what a task shows back: option ids read as option names. null clears. */
export type FieldValue = string | number | boolean | string[] | null;
/** A custom field as a task carries it. */
export interface CustomFieldValue { id: string; name: string; type: FieldType | null; value: FieldValue; }
export interface CustomFieldOption { id: string; name: string; color: string; }
export interface CustomField {
  id: string;
  name: string;
  /** null for a type this server does not know; the value is still shown. */
  type: FieldType | null;
  config: FieldConfig | null;
  /** Only select and multiselect fields have any. */
  options: CustomFieldOption[];
}
export interface NewCustomField { name: string; type: FieldType; config?: FieldConfig; }
/** PUT takes either or both; the type cannot change. */
export interface CustomFieldUpdate { name?: string; config?: FieldConfig; }
/** PUT on an option replaces both, so an update sends both too. */
export interface NewFieldOption { name: string; color: OptionColor; }

export type FieldScopeKind = (typeof fieldScopes)[number];
/** The id each scope kind is addressed by; a kind added to fieldScopes without a row here fails to compile. */
interface FieldScopeOwners { global: Record<never, never>; project: { projectId: number }; board: { boardId: number }; funnel: { funnelId: string }; }
/** Where a custom field lives. Each scope has its own routes, so the variant carries the owner's id. */
export type FieldScope = { [K in FieldScopeKind]: { kind: K } & FieldScopeOwners[K] }[FieldScopeKind];
/** Where a global, project or board field can be sent. */
export type TransferTarget = Extract<FieldScope, { kind: (typeof transferTargetKinds)[number] }>;
/** The neighbour a thing is placed next to; the API takes exactly one of the two. */
export type Placement = { after: string } | { before: string };

/** The id of the funnel is an opaque string (`OLY24hy2mC7n9D9l`), not a UUID — verified live 2026-10-14. */
export interface Funnel { id: string; name: string; customFields: CustomField[]; }

/** The fields every task on a board carries, read off a page of its tasks, with every project those tasks sit in. */
export interface BoardFieldSample { projectIds: number[]; fields: CustomField[]; }
