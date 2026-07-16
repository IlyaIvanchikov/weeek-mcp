import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient } from "../client.js";
import { jsonReply, errorReply } from "./reply.js";

export function registerReadTools(server: McpServer, client: WeeekClient): void {
  server.tool("weeek_list_projects", "List WEEEK projects (id + name).", {}, async () => {
    try { return jsonReply(await client.listProjects()); }
    catch (err) { return errorReply(err); }
  });

  server.tool(
    "weeek_list_tasks",
    "List WEEEK tasks. Optional projectId filter; paginated.",
    { projectId: z.number().int().optional(), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) },
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

  server.tool("weeek_get_task", "Get one WEEEK task by id.", { id: z.number().int() }, async (args) => {
    try { return jsonReply(await client.getTask(args.id)); }
    catch (err) { return errorReply(err); }
  });
}
