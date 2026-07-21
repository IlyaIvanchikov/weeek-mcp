import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient, WeeekTask } from "../client.js";
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
      description:
        "List WEEEK tasks with server-side filters. Set allPages=true together with userId, startDate, and endDate to fetch every matching page inside the connector without returning unrelated workspace pages.",
      inputSchema: {
        projectId: z.number().int().optional(),
        userId: z.string().uuid().optional(),
        completed: z.boolean().optional(),
        startDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/).optional(),
        endDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/).optional(),
        sortBy: z.enum(["name", "type", "priority", "duration", "overdue", "created", "date", "start"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
        allPages: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        const query: Record<string, string | number | boolean> = {};
        if (args.projectId !== undefined) query.projectId = args.projectId;
        if (args.userId !== undefined) query.userId = args.userId;
        if (args.completed !== undefined) query.completed = args.completed ? 1 : 0;
        if (args.startDate !== undefined) query.startDate = args.startDate;
        if (args.endDate !== undefined) query.endDate = args.endDate;
        if (args.sortBy !== undefined) query.sortBy = args.sortBy;

        if ((args.startDate === undefined) !== (args.endDate === undefined)) {
          throw new Error("startDate and endDate must be provided together");
        }

        if (!args.allPages) {
          query.perPage = args.limit;
          query.offset = args.offset;
          return jsonReply(await client.listTasks(query));
        }

        if (!args.userId || !args.startDate || !args.endDate) {
          throw new Error("allPages requires userId, startDate, and endDate so the connector never scans the full workspace");
        }

        const tasks: WeeekTask[] = [];
        let offset = args.offset;
        while (true) {
          const page = await client.listTasks({ ...query, perPage: args.limit, offset });
          tasks.push(...page);
          if (page.length < args.limit) break;
          offset += args.limit;
        }
        return jsonReply(tasks);
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
