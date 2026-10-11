import type { BinaryResponse } from "../http.js";
import type { attachmentServices } from "./constants.js";

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

export interface WeeekTask {
  id: number; title: string; description: string | null;
  projectId: number | null; boardId: number | null; boardColumnId: number | null;
  assignees: string[]; dueDate: string | null; completed: boolean;
  attachments: Attachment[];
}

export interface CreateTaskBody {
  title: string; projectId: number; boardColumnId?: number;
  description?: string; userId?: string; dayFrom?: string;
}
