import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeeekClient, WeeekTask } from "../client.js";
import { NAME, VERSION } from "../version.js";
import { jsonReply, imageReply, errorReply } from "./reply.js";

// Upper bound on auto-pagination: even with the required userId + date range, a
// wide range must not loop unbounded or build a response too large for the caller.
// On overflow we throw rather than silently truncate, so the caller narrows the range.
export const MAX_AUTO_PAGES = 20;

// An attachment id goes straight into the request path, and it reaches this tool from
// untrusted task text via the model. Restricting it to id characters keeps the path
// from being steered elsewhere; the API declares file_id as a plain string, so this
// deliberately does not demand a uuid it never promised.
const ATTACHMENT_ID = /^[A-Za-z0-9_-]+$/;

export interface AttachmentReadPolicy {
  /** Largest attachment body to pull into the reply. */
  maxBytes: number;
}

export function registerReadTools(server: McpServer, client: WeeekClient, policy: AttachmentReadPolicy): void {
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
        for (let page = 0; page < MAX_AUTO_PAGES; page++) {
          const batch = await client.listTasks({ ...query, perPage: args.limit, offset });
          tasks.push(...batch);
          if (batch.length < args.limit) return jsonReply(tasks);
          offset += args.limit;
        }
        throw new Error(`allPages exceeded ${MAX_AUTO_PAGES} pages; narrow startDate/endDate to reduce the result set`);
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
    "weeek_get_attachment",
    {
      description:
        "Read one WEEEK attachment by id. For an image WEEEK hosts itself this returns the image, so a task whose requirements live in a screenshot can actually be read instead of guessed at from the surrounding text; anything else comes back as metadata. Ids come from a task's `attachments` list (weeek_get_task).",
      inputSchema: {
        id: z.string().regex(ATTACHMENT_ID, "attachment id must be an id, not a path"),
        metadataOnly: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        const attachment = await client.getAttachment(args.id);
        if (args.metadataOnly) return jsonReply({ attachment });
        if (attachment.service !== "weeek") {
          return jsonReply({
            attachment,
            note: `stored in ${attachment.service}, not in WEEEK; open its url directly — only weeek-hosted attachments can be read through this tool`,
          });
        }
        const { bytes, contentType } = await client.downloadAttachment({
          attachment,
          maxBytes: policy.maxBytes,
        });
        // Never dump a binary into the conversation: only an image earns its bytes.
        if (!contentType.startsWith("image/")) {
          return jsonReply({ attachment, note: `not an image (${contentType}); its bytes are not returned` });
        }
        return imageReply(bytes, contentType);
      } catch (err) { return errorReply(err); }
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
