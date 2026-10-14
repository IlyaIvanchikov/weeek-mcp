import { taskPriorities } from "./constants.js";
import type { TaskPriority } from "./types.js";

export function priorityCode(name: TaskPriority): number {
  return taskPriorities.indexOf(name);
}

/** The name for a wire code, or null for anything that is not one — the API sends null for "unset". */
export function priorityName(code: unknown): TaskPriority | null {
  if (typeof code !== "number" || !Number.isInteger(code) || code < 0 || code >= taskPriorities.length) return null;
  return taskPriorities[code];
}
