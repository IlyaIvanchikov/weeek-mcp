// Every WEEEK API operation the server can call, as data. HttpClient executes an entry
// from this map and nothing else, and tests/contract.test.ts compares the map with the
// vendored spec in both directions — so an endpoint cannot be called without being
// registered, and cannot be registered if the spec does not have it.
//
// Path parameters are named by us, in camelCase ({taskId}); the spec is inconsistent
// ({id}, {task_id}, {taskId}) and the contract test normalises placeholders before comparing.

export const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export interface Operation {
  readonly method: HttpMethod;
  readonly path: string;
}

export const operations = {
  user: {
    me: { method: "GET", path: "/user/me" },
  },
  workspace: {
    get: { method: "GET", path: "/ws" },
    listMembers: { method: "GET", path: "/ws/members" },
  },
  tags: {
    list: { method: "GET", path: "/ws/tags" },
    create: { method: "POST", path: "/ws/tags" },
    get: { method: "GET", path: "/ws/tags/{tagId}" },
    update: { method: "PUT", path: "/ws/tags/{tagId}" },
    remove: { method: "DELETE", path: "/ws/tags/{tagId}" },
  },
  portfolios: {
    list: { method: "GET", path: "/tm/portfolios" },
    create: { method: "POST", path: "/tm/portfolios" },
    get: { method: "GET", path: "/tm/portfolios/{portfolioId}" },
    update: { method: "PUT", path: "/tm/portfolios/{portfolioId}" },
    remove: { method: "DELETE", path: "/tm/portfolios/{portfolioId}" },
  },
  projects: {
    list: { method: "GET", path: "/tm/projects" },
    create: { method: "POST", path: "/tm/projects" },
    get: { method: "GET", path: "/tm/projects/{projectId}" },
    update: { method: "PUT", path: "/tm/projects/{projectId}" },
    remove: { method: "DELETE", path: "/tm/projects/{projectId}" },
    archive: { method: "POST", path: "/tm/projects/{projectId}/archive" },
    unarchive: { method: "POST", path: "/tm/projects/{projectId}/un-archive" },
  },
  boards: {
    list: { method: "GET", path: "/tm/boards" },
    create: { method: "POST", path: "/tm/boards" },
    update: { method: "PUT", path: "/tm/boards/{boardId}" },
    remove: { method: "DELETE", path: "/tm/boards/{boardId}" },
    move: { method: "POST", path: "/tm/boards/{boardId}/move" },
  },
  columns: {
    list: { method: "GET", path: "/tm/board-columns" },
    create: { method: "POST", path: "/tm/board-columns" },
    update: { method: "PUT", path: "/tm/board-columns/{columnId}" },
    remove: { method: "DELETE", path: "/tm/board-columns/{columnId}" },
    move: { method: "POST", path: "/tm/board-columns/{columnId}/move" },
  },
  tasks: {
    list: { method: "GET", path: "/tm/tasks" },
    create: { method: "POST", path: "/tm/tasks" },
    get: { method: "GET", path: "/tm/tasks/{taskId}" },
    update: { method: "PUT", path: "/tm/tasks/{taskId}" },
    remove: { method: "DELETE", path: "/tm/tasks/{taskId}" },
    complete: { method: "POST", path: "/tm/tasks/{taskId}/complete" },
    uncomplete: { method: "POST", path: "/tm/tasks/{taskId}/un-complete" },
    changeBoard: { method: "POST", path: "/tm/tasks/{taskId}/board" },
    changeColumn: { method: "POST", path: "/tm/tasks/{taskId}/board-column" },
    uploadAttachment: { method: "POST", path: "/tm/tasks/{taskId}/attachments" },
    addLocation: { method: "POST", path: "/tm/tasks/{taskId}/locations" },
    removeLocation: { method: "DELETE", path: "/tm/tasks/{taskId}/locations" },
    addWatchers: { method: "POST", path: "/tm/tasks/{taskId}/watchers" },
    removeWatchers: { method: "DELETE", path: "/tm/tasks/{taskId}/watchers" },
    startTimer: { method: "POST", path: "/tm/tasks/{taskId}/start-timer" },
    stopTimer: { method: "POST", path: "/tm/tasks/{taskId}/stop-timer" },
    addTimeEntry: { method: "POST", path: "/tm/tasks/{taskId}/time-entries" },
    updateTimeEntry: { method: "PUT", path: "/tm/tasks/{taskId}/time-entries/{timeEntryId}" },
    removeTimeEntry: { method: "DELETE", path: "/tm/tasks/{taskId}/time-entries/{timeEntryId}" },
    addAssignees: { method: "POST", path: "/tm/tasks/{taskId}/assignees" },
    removeAssignees: { method: "DELETE", path: "/tm/tasks/{taskId}/assignees" },
    setParent: { method: "POST", path: "/tm/tasks/{taskId}/parent" },
    listComments: { method: "GET", path: "/tm/tasks/{taskId}/comments" },
    addComment: { method: "POST", path: "/tm/tasks/{taskId}/comments" },
    removeComment: { method: "DELETE", path: "/tm/tasks/{taskId}/comments/{commentId}" },
  },
  attachments: {
    get: { method: "GET", path: "/ws/attachments/{fileId}" },
  },
  // Custom fields: the same CRUD per scope. The four groups share member names so one
  // client method can pick a group by scope and call the same member (src/api/custom-fields.ts).
  globalFields: {
    list: { method: "GET", path: "/tm/custom-fields" },
    create: { method: "POST", path: "/tm/custom-fields" },
    update: { method: "PUT", path: "/tm/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/tm/custom-fields/{fieldId}" },
    transferToProject: { method: "POST", path: "/tm/custom-fields/{fieldId}/transfer-to-project" },
    transferToBoard: { method: "POST", path: "/tm/custom-fields/{fieldId}/transfer-to-board" },
    createOption: { method: "POST", path: "/tm/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/tm/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/tm/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/tm/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  projectFields: {
    create: { method: "POST", path: "/tm/projects/{projectId}/custom-fields" },
    update: { method: "PUT", path: "/tm/projects/{projectId}/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/tm/projects/{projectId}/custom-fields/{fieldId}" },
    // The API calls the global scope "task manager".
    transferToGlobal: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-task-manager" },
    transferToProject: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-project" },
    transferToBoard: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/transfer-to-board" },
    createOption: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/tm/projects/{projectId}/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  boardFields: {
    create: { method: "POST", path: "/tm/boards/{boardId}/custom-fields" },
    update: { method: "PUT", path: "/tm/boards/{boardId}/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/tm/boards/{boardId}/custom-fields/{fieldId}" },
    transferToGlobal: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/transfer-to-task-manager" },
    transferToProject: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/transfer-to-project" },
    transferToBoard: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/transfer-to-board" },
    createOption: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/tm/boards/{boardId}/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  funnelFields: {
    create: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields" },
    update: { method: "PUT", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}" },
    remove: { method: "DELETE", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}" },
    move: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/move" },
    createOption: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options" },
    updateOption: { method: "PUT", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options/{optionId}" },
    removeOption: { method: "DELETE", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options/{optionId}" },
    moveOption: { method: "POST", path: "/crm/funnels/{funnelId}/custom-fields/{fieldId}/options/{optionId}/move" },
  },
  // Pulled forward from Phase 4: funnel names must resolve for the funnel scope above.
  funnels: {
    list: { method: "GET", path: "/crm/funnels" },
  },
} as const satisfies Record<string, Record<string, Operation>>;

export function listOperations(): Operation[] {
  return Object.values(operations).flatMap((group) => Object.values(group) as Operation[]);
}
