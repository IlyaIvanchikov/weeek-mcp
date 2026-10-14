// WEEEK stores an attachment either itself ("weeek") or in a third-party drive. The set is
// closed, so it is a closed type: a new service must fail the type check wherever it is read.
export const attachmentServices = ["weeek", "google_drive", "dropbox", "one_drive", "box"] as const;

// A task priority travels as an integer code that is this list's index (0 low … 3 hold), so the
// list is the whole mapping; see src/api/priority.ts.
export const taskPriorities = ["low", "medium", "high", "hold"] as const;
export const taskTypes = ["action", "meet", "call"] as const;

// The spec types a project's status as 1 | 2 and documents neither value; the Phase 2 live
// smoke records which one an archived project carries (FOLLOWUPS).
export const projectStatuses = [1, 2] as const;
