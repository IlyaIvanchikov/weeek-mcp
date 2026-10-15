// The exact surface of each toolset. A rename or an accidental drop fails here on purpose.
export const defaultToolNames = [
  "weeek_version",
  "weeek_list_projects", "weeek_list_tasks", "weeek_get_task", "weeek_get_attachment", "weeek_list_members",
  "weeek_create_task", "weeek_create_tasks", "weeek_update_task", "weeek_delete_task",
  "weeek_attach_file", "weeek_move_task", "weeek_complete_task",
  "weeek_list_boards", "weeek_list_columns",
  "weeek_list_comments", "weeek_add_comment", "weeek_delete_comment",
  "weeek_add_assignees", "weeek_remove_assignees", "weeek_add_watchers", "weeek_remove_watchers",
  "weeek_add_task_to_project", "weeek_remove_task_from_project", "weeek_set_task_parent",
].sort();
export const timeToolNames = ["weeek_set_timer", "weeek_add_time_entry", "weeek_update_time_entry", "weeek_delete_time_entry"].sort();
export const projectToolNames = [
  "weeek_get_project", "weeek_create_project", "weeek_update_project", "weeek_archive_project", "weeek_delete_project",
  "weeek_create_board", "weeek_update_board", "weeek_delete_board", "weeek_move_board",
  "weeek_create_column", "weeek_update_column", "weeek_delete_column", "weeek_move_column",
  "weeek_list_portfolios", "weeek_get_portfolio", "weeek_create_portfolio", "weeek_update_portfolio", "weeek_delete_portfolio",
  "weeek_list_tags", "weeek_get_tag", "weeek_create_tag", "weeek_update_tag", "weeek_delete_tag",
  "weeek_get_workspace", "weeek_get_profile",
].sort();
export const customFieldToolNames = [
  "weeek_list_custom_fields", "weeek_create_custom_field", "weeek_update_custom_field", "weeek_delete_custom_field",
  "weeek_transfer_custom_field", "weeek_move_custom_field",
  "weeek_add_field_option", "weeek_update_field_option", "weeek_delete_field_option", "weeek_move_field_option",
].sort();

export const crmToolNames = [
  "weeek_list_funnels", "weeek_get_funnel", "weeek_create_funnel", "weeek_update_funnel", "weeek_delete_funnel",
  "weeek_list_statuses", "weeek_get_status", "weeek_create_status", "weeek_update_status", "weeek_delete_status",
  "weeek_list_currencies",
  "weeek_list_deals", "weeek_get_deal", "weeek_create_deal", "weeek_update_deal", "weeek_delete_deal", "weeek_move_deal",
  "weeek_add_deal_assignees", "weeek_remove_deal_assignees", "weeek_attach_organization", "weeek_detach_organization",
  "weeek_add_deal_task", "weeek_move_deal_task", "weeek_remove_deal_task", "weeek_attach_deal_file",
].sort();

/** Every tool `WEEEK_TOOLSETS=all` registers. Later toolsets add their list here. */
export const allToolNames = [...defaultToolNames, ...timeToolNames, ...projectToolNames, ...customFieldToolNames, ...crmToolNames].sort();
