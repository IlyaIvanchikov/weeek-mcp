import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient } from "../client.js";
import { NAME, VERSION } from "../version.js";
import { jsonReply, errorReply } from "./reply.js";

export function registerReadTools(server: McpServer, client: WeeekClient): void {
  server.registerTool(
    "weeek_version",
    { description: "Return this MCP server's name and version, so callers can check which build is running.", inputSchema: {} },
    async () => jsonReply({ name: NAME, version: VERSION }),
  );

  server.registerTool(
    "weeek_list_projects",
    { description: "List WEEEK projects (id + name).", inputSchema: {} },
    async () => {
      try { return jsonReply(await client.listProjects()); }
      catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_list_tasks",
    {
      description: "List WEEEK tasks. Optional projectId filter; paginated.",
      inputSchema: { projectId: z.number().int().optional(), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) },
    },
    async (args) => {
      try {
        const query: Record<string, number> = {};
        if (args.projectId !== undefined) query.projectId = args.projectId;
        if (args.limit !== undefined) query.perPage = args.limit;
        if (args.offset !== undefined) query.offset = args.offset;
        return jsonReply(await client.listTasks(query));
      } catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_get_task",
    { description: "Get one WEEEK task by id (includes its assignees).", inputSchema: { id: z.number().int() } },
    async (args) => {
      try { return jsonReply(await client.getTask(args.id)); }
      catch (err) { return errorReply(err); }
    },
  );

  server.registerTool(
    "weeek_list_members",
    {
      description:
        "List WEEEK workspace members (id + display name). Use to find the id for assigning a task to someone; pass that id as `assignee` to weeek_create_task.",
      inputSchema: {},
    },
    async () => {
      try { return jsonReply(await client.listMembers()); }
      catch (err) { return errorReply(err); }
    },
  );
}
