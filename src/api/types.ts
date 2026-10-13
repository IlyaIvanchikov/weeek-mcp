import type { BinaryResponse } from "../http.js";
import type { attachmentServices, taskPriorities, taskTypes } from "./constants.js";

export interface NamedEntity { id: number; name: string; }
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
