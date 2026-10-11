// src/operations.ts
//
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
  workspace: {
    listMembers: { method: "GET", path: "/ws/members" },
  },
  projects: {
    list: { method: "GET", path: "/tm/projects" },
  },
  boards: {
    list: { method: "GET", path: "/tm/boards" },
  },
  columns: {
    list: { method: "GET", path: "/tm/board-columns" },
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
  },
  attachments: {
    get: { method: "GET", path: "/ws/attachments/{fileId}" },
  },
} as const satisfies Record<string, Record<string, Operation>>;

export function listOperations(): Operation[] {
  return Object.values(operations).flatMap((group) => Object.values(group) as Operation[]);
}
