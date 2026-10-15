// Which groups of tools a running server exposes. The default stays small on purpose:
// every tool's schema travels to the model on every request, and registries score the
// count. Pick more with WEEEK_TOOLSETS (comma-separated) or "all". The set grows by one
// per release phase: projects, custom-fields, crm.
// time: the timer and time entries, carved out so the default stays small.
// projects: projects, boards, columns, portfolios, tags, workspace — the structure around tasks.
// custom-fields: field and option administration in every scope; values on tasks stay in tasks.
// crm: funnels, statuses, deals, organizations, contacts, currencies — opt-in because it is 42 tools.
export const toolsetNames = ["tasks", "time", "projects", "custom-fields", "crm", "all"] as const;
// parseToolsets returns this as ToolsetName[], so a misspelt member fails the type check there.
export const defaultToolsets = ["tasks"] as const;
