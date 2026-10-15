import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolContext } from "../toolsets/types.js";
import type { Resolver } from "../resolver.js";
import type { DealPatch, DealPlacement, NewDeal } from "../client.js";
import { dealOutcomes, dealSorts } from "../api/constants.js";
import { resolveSafeAttachPath } from "../attach.js";
import { mapWithLimit } from "../concurrency.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, nameOrIdList, page, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { resolveMembers } from "./members.js";
import { encodeFieldValues, fieldValues, type FieldValues } from "./field-values.js";
import { dealRef, findDeal, resolveDealContext } from "./crm-refs.js";

// Listing a funnel's deals asks every status; this many at once.
const statusListConcurrency = 5;

const outcome = z.enum(dealOutcomes);

/** The deal's links by name, resolved in parallel; a list given replaces the deal's. */
interface LinkInput { assignees?: Array<string | number>; organizations?: Array<string | number>; contacts?: Array<string | number>; tags?: Array<string | number>; }
async function resolveLinks(resolver: Resolver, input: LinkInput): Promise<Pick<DealPatch, "assignees" | "organizations" | "contacts" | "tags">> {
  const [assignees, organizations, contacts, tags] = await Promise.all([
    input.assignees === undefined ? undefined : resolveMembers(resolver, input.assignees),
    input.organizations === undefined ? undefined : Promise.all(input.organizations.map((value) => resolver.resolve({ kind: "organization", value }))),
    input.contacts === undefined ? undefined : Promise.all(input.contacts.map((value) => resolver.resolve({ kind: "contact", value }))),
    input.tags === undefined ? undefined : Promise.all(input.tags.map((value) => resolver.resolve({ kind: "tag", value }))),
  ]);
  return { assignees, organizations, contacts, tags };
}

/** Field values by name, resolved against the funnel's fields. */
async function encodeDealFields(resolver: Resolver, funnelId: string, values: FieldValues): Promise<Record<string, unknown>> {
  const fields = await resolver.list({ kind: "customField", scope: { fieldScope: { kind: "funnel", funnelId } } });
  return encodeFieldValues({ resolver, fields, values });
}

const linkShape = {
  assignees: nameOrIdList.optional().describe("Members by name or id; replaces the deal's assignees."),
  organizations: nameOrIdList.optional().describe("Organizations by name or id; replaces the deal's."),
  contacts: nameOrIdList.optional().describe("Contacts by full name or id; replaces the deal's."),
  tags: nameOrIdList.optional().describe("Tags by title or id; replaces the deal's."),
};

/** Deals: the pipeline's items, always reached through a status or a funnel. */
export function registerDealTools({ server, client, resolver, attachPolicy }: ToolContext): void {
  registerJsonTool(server, "weeek_list_deals", {
    description: "List CRM deals in one `status` (by id, or by name with `funnel`) or in every status of a `funnel`: optional `search` text and `sort`. Paged per status: `limit` and `offset` apply to each status, so a funnel-wide list returns up to `limit` × statuses deals; `hasMore` says whether any status has more.",
    inputSchema: { status: nameOrId.optional(), funnel: nameOrId.optional(), search: z.string().min(1).optional(), sort: z.enum(dealSorts).optional(), ...page },
  }, async (args) => {
    const { funnelId, statusId } = await resolveDealContext(resolver, args);
    const query = { search: args.search, sort: args.sort, limit: args.limit, offset: args.offset };
    if (statusId !== undefined) return client.crm.deals.list({ statusId, query });
    if (funnelId === undefined) throw new Error("pass a status or a funnel (name or id)");
    const statuses = await client.crm.statuses.list(funnelId);
    const pages = await mapWithLimit(statuses, statusListConcurrency, (status) => client.crm.deals.list({ statusId: status.id, query }));
    return { deals: pages.flatMap((dealPage) => dealPage.deals), hasMore: pages.some((dealPage) => dealPage.hasMore) };
  });

  registerJsonTool(server, "weeek_get_deal", {
    description: "Get one CRM deal: by its id alone, or by title together with its `funnel` or `status`. Returns amount, outcome, assignees, organizations, contacts, tags, tasks, custom-field values and attachments.",
    inputSchema: dealRef,
  }, async (args) => client.crm.deals.get((await findDeal(resolver, args)).id));

  registerJsonTool(server, "weeek_create_deal", {
    description: "Create a CRM deal in a `status` (by id, or by name with `funnel`): `title`, optional amount, outcome (won, lost, archived), description, assignees, organizations, contacts and tags by name, and custom-field `fields` by name (fields need `funnel`).",
    inputSchema: { status: nameOrId, funnel: nameOrId.optional(), title: z.string().min(1), amount: z.number().optional(), outcome: outcome.optional(), description: z.string().optional(), ...linkShape, fields: fieldValues.optional() },
  }, async (args) => {
    const funnelId = args.funnel === undefined ? undefined : await resolver.resolve({ kind: "funnel", value: args.funnel });
    let customFields: Record<string, unknown> | undefined;
    if (args.fields !== undefined) {
      if (funnelId === undefined) throw new Error("fields on a new deal need `funnel` (name or id) to resolve the field names");
      customFields = await encodeDealFields(resolver, funnelId, args.fields);
    }
    const statusId = await resolver.resolve({ kind: "status", value: args.status, scope: { funnelId } });
    const links = await resolveLinks(resolver, args);
    const deal: NewDeal = { title: args.title, amount: args.amount, outcome: args.outcome, description: args.description, ...links };
    if (customFields !== undefined) deal.customFields = customFields;
    const created = await client.crm.deals.create({ statusId, deal });
    resolver.forget({ kind: "deal" });
    return created;
  });

  registerJsonTool(server, "weeek_update_deal", {
    description: "Change a CRM deal (by id, or by title with `funnel`/`status`): title, amount (null clears), outcome (won, lost, archived; null reopens), description, and the assignees, organizations, contacts, tags (each list replaces) and custom-field `fields` by name. Fields you omit keep their value.",
    inputSchema: { ...dealRef, title: z.string().min(1).optional(), amount: z.number().nullable().optional(), outcome: outcome.nullable().optional(), description: z.string().nullable().optional(), ...linkShape, fields: fieldValues.optional() },
  }, async (args) => {
    const deal = await findDeal(resolver, args);
    const patch: DealPatch = { ...(await resolveLinks(resolver, args)) };
    if (args.title !== undefined) patch.title = args.title;
    if (args.amount !== undefined) patch.amount = args.amount;
    if (args.outcome !== undefined) patch.outcome = args.outcome;
    if (args.description !== undefined) patch.description = args.description;
    if (args.fields !== undefined) patch.customFields = await encodeDealFields(resolver, deal.funnelId, args.fields);
    const updated = await client.crm.deals.update({ dealId: deal.id, patch });
    resolver.forget({ kind: "deal" });
    return updated;
  });

  registerJsonTool(server, "weeek_delete_deal", {
    description: "Permanently delete a CRM deal (by id, or by title with `funnel`/`status`). Irreversible; requires confirm:true.",
    inputSchema: { ...dealRef, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const removal = await client.crm.deals.remove((await findDeal(resolver, args)).id);
    resolver.forget({ kind: "deal" });
    return removal;
  });

  registerJsonTool(server, "weeek_move_deal", {
    description: "Move a CRM deal: `to_funnel` (another funnel), `to_status` (a status of its funnel, or of `to_funnel`), and/or `after` — the deal it goes right after in that status (null = first). Pass at least one; `after` with `to_funnel` needs `to_status`.",
    inputSchema: { ...dealRef, to_funnel: nameOrId.optional(), to_status: nameOrId.optional(), after: nameOrId.nullable().optional() },
  }, async (args) => {
    if (args.to_funnel === undefined && args.to_status === undefined && args.after === undefined) throw new Error("pass to_funnel, to_status or after");
    if (args.to_funnel !== undefined && args.after !== undefined && args.to_status === undefined) throw new Error("placing a deal with `after` in another funnel needs `to_status`");
    const deal = await findDeal(resolver, args);
    // Resolve every id first: a bad name must not leave the deal half-moved.
    const targetFunnelId = args.to_funnel === undefined ? deal.funnelId : await resolver.resolve({ kind: "funnel", value: args.to_funnel });
    const targetStatusId = args.to_status === undefined ? null : await resolver.resolve({ kind: "status", value: args.to_status, scope: { funnelId: targetFunnelId } });
    const searchStatusId = targetStatusId ?? deal.statusId;
    const previousDeal = args.after === undefined || args.after === null ? null : await resolver.find({ kind: "deal", value: args.after, scope: { statusId: searchStatusId } });
    // An `after` given by id is looked up without the status, so check it sits where the deal is going.
    if (previousDeal !== null && previousDeal.statusId !== searchStatusId) throw new Error("`after` names a deal in another status");
    const previousDealId = previousDeal === null ? null : previousDeal.id;
    if (args.to_funnel !== undefined) await client.crm.deals.setFunnel({ dealId: deal.id, funnelId: targetFunnelId });
    if (args.after !== undefined) {
      const placement: DealPlacement = { statusId: targetStatusId, previousDealId };
      await client.crm.deals.move({ dealId: deal.id, placement });
    } else if (targetStatusId !== null) {
      await client.crm.deals.setStatus({ dealId: deal.id, statusId: targetStatusId });
    }
    resolver.forget({ kind: "deal" });
    return client.crm.deals.get(deal.id);
  });

  registerJsonTool(server, "weeek_add_deal_assignees", {
    description: "Assign members (by name or id) to a CRM deal, keeping the existing assignees. Returns the deal.",
    inputSchema: { ...dealRef, assignees: nameOrIdList },
  }, async (args) => {
    const deal = await findDeal(resolver, args);
    for (const memberId of await resolveMembers(resolver, args.assignees)) await client.crm.deals.addAssignee({ dealId: deal.id, memberId });
    resolver.forget({ kind: "deal" });
    return client.crm.deals.get(deal.id);
  });

  registerJsonTool(server, "weeek_remove_deal_assignees", {
    description: "Unassign members (by name or id) from a CRM deal. Requires confirm:true. Returns the deal.",
    inputSchema: { ...dealRef, assignees: nameOrIdList, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const deal = await findDeal(resolver, args);
    for (const memberId of await resolveMembers(resolver, args.assignees)) await client.crm.deals.removeAssignee({ dealId: deal.id, memberId });
    resolver.forget({ kind: "deal" });
    return client.crm.deals.get(deal.id);
  });

  registerJsonTool(server, "weeek_attach_organization", {
    description: "Link an organization (by name or id) to a CRM deal. Returns the deal.",
    inputSchema: { ...dealRef, organization: nameOrId },
  }, async (args) => {
    const deal = await findDeal(resolver, args);
    await client.crm.deals.addOrganization({ dealId: deal.id, organizationId: await resolver.resolve({ kind: "organization", value: args.organization }) });
    resolver.forget({ kind: "deal" });
    return client.crm.deals.get(deal.id);
  });

  registerJsonTool(server, "weeek_detach_organization", {
    description: "Unlink an organization (by name or id) from a CRM deal. Requires confirm:true. Returns the deal.",
    inputSchema: { ...dealRef, organization: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const deal = await findDeal(resolver, args);
    await client.crm.deals.removeOrganization({ dealId: deal.id, organizationId: await resolver.resolve({ kind: "organization", value: args.organization }) });
    resolver.forget({ kind: "deal" });
    return client.crm.deals.get(deal.id);
  });

  registerJsonTool(server, "weeek_add_deal_task", {
    description: "Create a task attached to a CRM deal: a `title` and an optional description. Returns the task.",
    inputSchema: { ...dealRef, title: z.string().min(1), description: z.string().optional() },
  }, async (args) => client.crm.deals.addTask({ dealId: (await findDeal(resolver, args)).id, title: args.title, description: args.description }));

  registerJsonTool(server, "weeek_move_deal_task", {
    description: "Reorder a task inside a CRM deal: place `task_id` right after the task `after` (a task id; null = first).",
    inputSchema: { ...dealRef, task_id: taskId, after: z.number().int().nullable() },
  }, async (args) => client.crm.deals.moveTask({ dealId: (await findDeal(resolver, args)).id, taskId: args.task_id, previousTaskId: args.after }));

  registerJsonTool(server, "weeek_remove_deal_task", {
    description: "Detach a task (by id) from a CRM deal. Requires confirm:true.",
    inputSchema: { ...dealRef, task_id: taskId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.crm.deals.removeTask({ dealId: (await findDeal(resolver, args)).id, taskId: args.task_id }));

  registerJsonTool(server, "weeek_attach_deal_file", {
    description: "Attach a local file to a CRM deal. Only files inside the allowed directory (the server's working directory by default, or WEEEK_ATTACH_DIR) and its subfolders may be attached; paths outside it are refused.",
    inputSchema: { ...dealRef, path: z.string() },
    annotations: { openWorldHint: true },
  }, async (args) => {
    const deal = await findDeal(resolver, args);
    const safePath = await resolveSafeAttachPath(args.path, attachPolicy);
    const bytes = await readFile(safePath);
    return client.crm.deals.uploadAttachment({ dealId: deal.id, filename: basename(safePath), bytes });
  });
}
