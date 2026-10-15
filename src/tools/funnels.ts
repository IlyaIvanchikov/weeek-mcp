import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { resolveStatus, statusRef } from "./crm-refs.js";

const currencyRef = nameOrId.optional().describe("A currency by code (RUB, USD, EUR, …) or id; weeek_list_currencies lists them.");

/** Funnels, their statuses, and the currencies a funnel can count in. */
export function registerFunnelTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_funnels", {
    description: "List the WEEEK CRM funnels: id, name, currency, privacy, deal count and amount, team and custom fields.",
    inputSchema: {},
  }, async () => client.crm.funnels.list());

  registerJsonTool(server, "weeek_get_funnel", {
    description: "Get one CRM funnel by name or id.",
    inputSchema: { funnel: nameOrId },
  }, async (args) => client.crm.funnels.get(await resolver.resolve({ kind: "funnel", value: args.funnel })));

  registerJsonTool(server, "weeek_create_funnel", {
    description: "Create a CRM funnel with a `name`, an optional `currency` (code or id) and `private` (default false).",
    inputSchema: { name: z.string().min(1), currency: currencyRef, private: z.boolean().default(false) },
  }, async (args) => {
    const currencyId = args.currency === undefined ? undefined : await resolver.resolve({ kind: "currency", value: args.currency });
    const funnel = await client.crm.funnels.create({ name: args.name, currencyId, isPrivate: args.private });
    resolver.forget({ kind: "funnel" });
    return funnel;
  });

  registerJsonTool(server, "weeek_update_funnel", {
    description: "Rename a CRM funnel (by name or id) or change its currency or privacy. Fields you omit keep their current value.",
    inputSchema: { funnel: nameOrId, name: z.string().min(1).optional(), currency: currencyRef, private: z.boolean().optional() },
  }, async (args) => {
    const currentFunnel = await resolver.find({ kind: "funnel", value: args.funnel });
    // PUT replaces all three fields, so the current funnel is the base.
    const currencyId = args.currency === undefined ? currentFunnel.currencyId : await resolver.resolve({ kind: "currency", value: args.currency });
    const funnel = await client.crm.funnels.update({ funnelId: currentFunnel.id, update: { name: args.name ?? currentFunnel.name, currencyId, isPrivate: args.private ?? currentFunnel.isPrivate } });
    resolver.forget({ kind: "funnel" });
    return funnel;
  });

  registerJsonTool(server, "weeek_delete_funnel", {
    description: "Permanently delete a CRM funnel (by name or id) with its statuses and deals. Irreversible; requires confirm:true.",
    inputSchema: { funnel: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const funnelId = await resolver.resolve({ kind: "funnel", value: args.funnel });
    const removal = await client.crm.funnels.remove(funnelId);
    resolver.forget({ kind: "funnel" });
    resolver.forget({ kind: "status", scope: { funnelId } });
    resolver.forget({ kind: "deal" });
    return removal;
  });

  registerJsonTool(server, "weeek_list_statuses", {
    description: "List the statuses (stages) of a CRM funnel (by name or id): id, name, deal count and amount.",
    inputSchema: { funnel: nameOrId },
  }, async (args) => client.crm.statuses.list(await resolver.resolve({ kind: "funnel", value: args.funnel })));

  registerJsonTool(server, "weeek_get_status", {
    description: "Get one funnel status by id, or by name together with its `funnel`.",
    inputSchema: statusRef,
  }, async (args) => client.crm.statuses.get(await resolveStatus(resolver, args)));

  registerJsonTool(server, "weeek_create_status", {
    description: "Add a status (stage) to a CRM funnel (by name or id).",
    inputSchema: { funnel: nameOrId, name: z.string().min(1) },
  }, async (args) => {
    const funnelId = await resolver.resolve({ kind: "funnel", value: args.funnel });
    const status = await client.crm.statuses.create({ funnelId, name: args.name });
    resolver.forget({ kind: "status", scope: { funnelId } });
    return status;
  });

  registerJsonTool(server, "weeek_update_status", {
    description: "Rename a funnel status (by id, or by name with its `funnel`).",
    inputSchema: { ...statusRef, name: z.string().min(1) },
  }, async (args) => {
    const status = await client.crm.statuses.update({ statusId: await resolveStatus(resolver, args), name: args.name });
    resolver.forget({ kind: "status" });
    return status;
  });

  registerJsonTool(server, "weeek_delete_status", {
    description: "Permanently delete a funnel status (by id, or by name with its `funnel`) and the deals in it. Irreversible; requires confirm:true.",
    inputSchema: { ...statusRef, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const removal = await client.crm.statuses.remove(await resolveStatus(resolver, args));
    resolver.forget({ kind: "status" });
    resolver.forget({ kind: "deal" });
    return removal;
  });

  registerJsonTool(server, "weeek_list_currencies", {
    description: "List the currencies WEEEK offers for funnels and deal amounts: id, name, code, symbol.",
    inputSchema: {},
  }, async () => client.crm.currencies.list());
}
