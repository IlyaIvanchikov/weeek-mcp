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
/** Every tool `WEEEK_TOOLSETS=all` registers. Later toolsets add their list here. */
export const allToolNames = [...defaultToolNames, ...timeToolNames].sort();
