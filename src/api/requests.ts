import { WeeekApiError } from "../errors.js";
import type { Attachment } from "./types.js";

/** The API documents several booleans as "use 0 or 1 instead of false or true" (isPrivate, completed, all). */
export function apiFlag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

/** The entity, or null when the API answers 404 — how an id-shaped value is tried before a search. */
export async function orNullWhenMissing<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof WeeekApiError && err.status === 404) return null;
    throw err;
  }
}

export interface AttachmentFormOptions { filename: string; bytes: Uint8Array | Blob; }

/** The multipart body the attachment routes take: one file under `files[]`. */
export function attachmentForm({ filename, bytes }: AttachmentFormOptions): FormData {
  const form = new FormData();
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart]);
  form.append("files[]", blob, filename);
  return form;
}

/** The spec documents `data` as one Attachment; a list is accepted too — `files[]` is a multipart array (FOLLOWUPS #18). */
export function pickAttachments(json: { data?: unknown }): Attachment[] {
  if (Array.isArray(json.data)) return json.data as Attachment[];
  return json.data ? [json.data as Attachment] : [];
}
