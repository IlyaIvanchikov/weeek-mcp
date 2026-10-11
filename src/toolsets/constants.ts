// Which groups of tools a running server exposes. The default stays small on purpose:
// every tool's schema travels to the model on every request, and registries score the
// count. Pick more with WEEEK_TOOLSETS (comma-separated) or "all". The set grows by one
// per release phase: projects, custom-fields, crm.
export const toolsetNames = ["tasks", "all"] as const;
// parseToolsets returns this as ToolsetName[], so a misspelt member fails the type check there.
export const defaultToolsets = ["tasks"] as const;
