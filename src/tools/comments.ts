import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, page, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

export function registerCommentTools({ server, client }: ToolContext): void {
  registerJsonTool(server, "weeek_list_comments", {
    description: "List the comments on a WEEEK task: id, author member id, markdown, reply parent, timestamps. Paged; `hasMore` says whether to call again with a larger offset.",
    inputSchema: { id: taskId, ...page },
  }, async (args) => client.tasks.listComments({ taskId: args.id, limit: args.limit, offset: args.offset }));

  registerJsonTool(server, "weeek_add_comment", {
    description: "Add a markdown comment to a WEEEK task as the token's owner. Pass `reply_to` (a comment id from weeek_list_comments) to answer in a thread.",
    inputSchema: { id: taskId, markdown: z.string().min(1), reply_to: z.number().int().optional() },
  }, async (args) => client.tasks.addComment({ taskId: args.id, markdown: args.markdown, parentId: args.reply_to }));

  registerJsonTool(server, "weeek_delete_comment", {
    description: "Permanently delete one comment from a WEEEK task. Irreversible; requires confirm:true.",
    inputSchema: { id: taskId, comment_id: z.number().int(), confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeComment({ taskId: args.id, commentId: args.comment_id }));
}
