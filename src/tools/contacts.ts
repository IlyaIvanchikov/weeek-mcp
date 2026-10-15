import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, nameOrIdList } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { crmListShape, detailValues } from "./organizations.js";

const nameText = z.string().min(1);

export function registerContactTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_contacts", {
    description: "List CRM contacts, optionally narrowed by `search` text, sorted by alphabet or updatedAt. Paged; `hasMore` is true when a full page came back.",
    inputSchema: crmListShape,
  }, async (args) => client.crm.contacts.list({ search: args.search, sort: args.sort, limit: args.limit, offset: args.offset }));

  registerJsonTool(server, "weeek_get_contact", {
    description: "Get one CRM contact by full name or id: names, organization ids, emails, phones and tags.",
    inputSchema: { contact: nameOrId },
  }, async (args) => client.crm.contacts.get(await resolver.resolve({ kind: "contact", value: args.contact })));

  registerJsonTool(server, "weeek_create_contact", {
    description: "Create a CRM contact: `first_name`, optional middle and last names, `organizations` and `tags` by name or id, and emails and phones as plain strings.",
    inputSchema: { first_name: nameText, middle_name: nameText.optional(), last_name: nameText.optional(), organizations: nameOrIdList.optional(), emails: detailValues, phones: detailValues, tags: nameOrIdList.optional() },
  }, async (args) => {
    const [organizations, tags] = await Promise.all([
      args.organizations === undefined ? undefined : Promise.all(args.organizations.map((value) => resolver.resolve({ kind: "organization", value }))),
      args.tags === undefined ? undefined : Promise.all(args.tags.map((value) => resolver.resolve({ kind: "tag", value }))),
    ]);
    const contact = await client.crm.contacts.create({ firstName: args.first_name, middleName: args.middle_name, lastName: args.last_name, organizations, emails: args.emails, phones: args.phones, tags });
    resolver.forget({ kind: "contact" });
    return contact;
  });

  registerJsonTool(server, "weeek_update_contact", {
    description: "Change a CRM contact's first, middle or last name (contact by full name or id). Names you omit keep their value; organizations, emails, phones and tags have their own tools.",
    inputSchema: { contact: nameOrId, first_name: nameText.optional(), middle_name: nameText.nullable().optional(), last_name: nameText.nullable().optional() },
  }, async (args) => {
    const contactId = await resolver.resolve({ kind: "contact", value: args.contact });
    // PUT replaces the names, so the base is read fresh: a cached search entry can be 60 s old.
    const currentContact = await client.crm.contacts.get(contactId);
    const contact = await client.crm.contacts.update({
      contactId,
      update: { firstName: args.first_name ?? currentContact.firstName, middleName: args.middle_name === undefined ? currentContact.middleName : args.middle_name, lastName: args.last_name === undefined ? currentContact.lastName : args.last_name },
    });
    resolver.forget({ kind: "contact" });
    return contact;
  });

  registerJsonTool(server, "weeek_delete_contact", {
    description: "Permanently delete a CRM contact (by full name or id). Irreversible; requires confirm:true.",
    inputSchema: { contact: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const removal = await client.crm.contacts.remove(await resolver.resolve({ kind: "contact", value: args.contact }));
    resolver.forget({ kind: "contact" });
    return removal;
  });
}
