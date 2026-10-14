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

// Custom fields. The vocabulary is the spec's CustomField schema and the option request bodies.
export const fieldTypes = ["text", "number", "boolean", "datetime", "select", "multiselect", "member", "contact", "link", "approval"] as const;
export const fieldScopes = ["global", "project", "board", "funnel"] as const;
// A funnel's fields stay in their funnel; the other three scopes can send a field to each other.
export const transferTargetKinds = ["global", "project", "board"] as const;
// The 13 names every request body accepts. The CustomFieldOption schema lists 12 slightly
// different ones (dark_green instead of turquoise and yellow); FOLLOWUPS records which the API honours.
export const optionColors = ["blue", "light_blue", "dark_purple", "purple", "dark_pink", "pink", "light_pink", "red", "turquoise", "green", "light_green", "dark_yellow", "yellow"] as const;
export const numberFormats = ["number", "currency", "percent"] as const;
export const booleanStyles = ["radio", "checkbox"] as const;
