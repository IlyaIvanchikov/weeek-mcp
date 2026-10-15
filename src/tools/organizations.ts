import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { crmSorts } from "../api/constants.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, nameOrIdList, nameOrIdListCap, page } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { resolveMembers } from "./members.js";

export const crmListShape = { search: z.string().min(1).optional(), sort: z.enum(crmSorts).optional(), ...page };
/** Plain strings (an address, an email, a phone) given at creation; later ones go through weeek_add_detail. */
export const detailValues = z.array(z.string().min(1)).max(nameOrIdListCap).optional();

export function registerOrganizationTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_organizations", {
    description: "List CRM organizations, optionally narrowed by `search` text, sorted by alphabet or updatedAt. Paged; `hasMore` is true when a full page came back.",
    inputSchema: crmListShape,
  }, async (args) => client.crm.organizations.list({ search: args.search, sort: args.sort, limit: args.limit, offset: args.offset }));

  registerJsonTool(server, "weeek_get_organization", {
    description: "Get one CRM organization by name or id: responsible member, addresses, emails, phones, contact ids and tags.",
    inputSchema: { organization: nameOrId },
  }, async (args) => client.crm.organizations.get(await resolver.resolve({ kind: "organization", value: args.organization })));

  registerJsonTool(server, "weeek_create_organization", {
    description: "Create a CRM organization: `name`, optional addresses, emails and phones (plain strings) and `responsibles` (members by name or id).",
    inputSchema: { name: z.string().min(1), addresses: detailValues, emails: detailValues, phones: detailValues, responsibles: nameOrIdList.optional() },
  }, async (args) => {
    const responsibles = args.responsibles === undefined ? undefined : await resolveMembers(resolver, args.responsibles);
    const organization = await client.crm.organizations.create({ name: args.name, addresses: args.addresses, emails: args.emails, phones: args.phones, responsibles });
    resolver.forget({ kind: "organization" });
    return organization;
  });

  registerJsonTool(server, "weeek_update_organization", {
    description: "Rename a CRM organization (by name or id) or change its `responsibles` (members by name or id). Addresses, emails and phones are changed with the detail tools.",
    inputSchema: { organization: nameOrId, name: z.string().min(1).optional(), responsibles: nameOrIdList.optional() },
  }, async (args) => {
    const currentOrganization = await resolver.find({ kind: "organization", value: args.organization });
    // PUT replaces; the detail arrays are omitted on purpose so the API keeps them (FOLLOWUPS 24 c).
    const responsibles = args.responsibles === undefined
      ? (currentOrganization.responsibleId === null ? [] : [currentOrganization.responsibleId])
      : await resolveMembers(resolver, args.responsibles);
    const organization = await client.crm.organizations.update({ organizationId: currentOrganization.id, update: { name: args.name ?? currentOrganization.name, responsibles } });
    resolver.forget({ kind: "organization" });
    return organization;
  });

  registerJsonTool(server, "weeek_delete_organization", {
    description: "Permanently delete a CRM organization (by name or id). Irreversible; requires confirm:true.",
    inputSchema: { organization: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const removal = await client.crm.organizations.remove(await resolver.resolve({ kind: "organization", value: args.organization }));
    resolver.forget({ kind: "organization" });
    return removal;
  });
}
