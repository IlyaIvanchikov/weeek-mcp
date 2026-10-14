import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, hexColor, nameOrId, page } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

/** Workspace-level things: portfolios, tags, the workspace itself, the token's owner. */
export function registerWorkspaceTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_portfolios", {
    description: "List WEEEK portfolios (folders of projects), optionally narrowed by `search` text or a `parent` portfolio (name or id). Paged; `hasMore` says whether to call again with a larger offset.",
    inputSchema: { search: z.string().min(1).optional(), parent: nameOrId.optional(), ...page },
  }, async (args) => {
    const parentId = args.parent === undefined ? undefined : await resolver.resolve({ kind: "portfolio", value: args.parent });
    return client.portfolios.list({ search: args.search, parentId, limit: args.limit, offset: args.offset });
  });

  registerJsonTool(server, "weeek_get_portfolio", {
    description: "Get one WEEEK portfolio by name or id: parent portfolio and privacy.",
    inputSchema: { portfolio: nameOrId },
  }, async (args) => client.portfolios.get(await resolver.resolve({ kind: "portfolio", value: args.portfolio })));

  registerJsonTool(server, "weeek_create_portfolio", {
    description: "Create a WEEEK portfolio, optionally inside a `parent` portfolio (name or id).",
    inputSchema: { name: z.string().min(1), parent: nameOrId.optional() },
  }, async (args) => {
    const parentId = args.parent === undefined ? undefined : await resolver.resolve({ kind: "portfolio", value: args.parent });
    const portfolio = await client.portfolios.create({ name: args.name, parentId });
    resolver.forget({ kind: "portfolio" });
    return portfolio;
  });

  registerJsonTool(server, "weeek_update_portfolio", {
    description: "Rename a WEEEK portfolio (by name or id).",
    inputSchema: { portfolio: nameOrId, name: z.string().min(1) },
  }, async (args) => {
    const portfolioId = await resolver.resolve({ kind: "portfolio", value: args.portfolio });
    const portfolio = await client.portfolios.update({ portfolioId, name: args.name });
    resolver.forget({ kind: "portfolio" });
    return portfolio;
  });

  registerJsonTool(server, "weeek_delete_portfolio", {
    description: "Permanently delete a WEEEK portfolio (by name or id). Irreversible; requires confirm:true.",
    inputSchema: { portfolio: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const portfolioId = await resolver.resolve({ kind: "portfolio", value: args.portfolio });
    const removal = await client.portfolios.remove(portfolioId);
    resolver.forget({ kind: "portfolio" });
    return removal;
  });

  registerJsonTool(server, "weeek_list_tags", {
    description: "List the workspace's WEEEK tags: id, title, colour. weeek_update_task takes tags by these titles.",
    inputSchema: {},
  }, async () => client.tags.list());

  registerJsonTool(server, "weeek_get_tag", {
    description: "Get one WEEEK tag by title or id.",
    inputSchema: { tag: nameOrId },
  }, async (args) => client.tags.get(await resolver.resolve({ kind: "tag", value: args.tag })));

  registerJsonTool(server, "weeek_create_tag", {
    description: "Create a WEEEK workspace tag with the given title; WEEEK assigns its colour, which weeek_update_tag can change.",
    inputSchema: { title: z.string().min(1) },
  }, async (args) => {
    const tag = await client.tags.create({ title: args.title });
    resolver.forget({ kind: "tag" });
    return tag;
  });

  registerJsonTool(server, "weeek_update_tag", {
    description: "Change a WEEEK tag's title or colour (tag by title or id). Fields you omit keep their current value.",
    inputSchema: { tag: nameOrId, title: z.string().min(1).optional(), color: hexColor.optional() },
  }, async (args) => {
    const tagId = await resolver.resolve({ kind: "tag", value: args.tag });
    // PUT replaces both fields, so the current tag is read first.
    const currentTag = await client.tags.get(tagId);
    const tag = await client.tags.update({ tagId, update: { title: args.title ?? currentTag.title, color: args.color ?? currentTag.color } });
    resolver.forget({ kind: "tag" });
    return tag;
  });

  registerJsonTool(server, "weeek_delete_tag", {
    description: "Permanently delete a WEEEK tag (by title or id) from the workspace and every task that carries it. Irreversible; requires confirm:true.",
    inputSchema: { tag: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const tagId = await resolver.resolve({ kind: "tag", value: args.tag });
    const removal = await client.tags.remove(tagId);
    resolver.forget({ kind: "tag" });
    return removal;
  });

  registerJsonTool(server, "weeek_get_workspace", {
    description: "Get the WEEEK workspace the token belongs to: id, title, description, whether it is a personal workspace.",
    inputSchema: {},
  }, async () => client.workspace.get());

  registerJsonTool(server, "weeek_get_profile", {
    description: "Get the profile of the token's owner: member id, name, email, language, time zone. The id is what a task's `assignees` and `watchers` hold for you.",
    inputSchema: {},
  }, async () => client.user.me());
}
