import type { BinaryResponse } from "../http.js";
import type { attachmentServices, projectStatuses, taskPriorities, taskTypes } from "./constants.js";

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
}

export interface NewTask {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
  /** Wire code; use priorityCode() to build it from a name. */
  priority?: number;
  type?: TaskType;
  parentId?: number;
}

export type ProjectStatus = (typeof projectStatuses)[number];

export interface Project {
  id: number; name: string; description: string | null; color: string | null;
  status: ProjectStatus | null; isPrivate: boolean; portfolioId: number | null;
  /** Member ids. */
  team: string[];
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
