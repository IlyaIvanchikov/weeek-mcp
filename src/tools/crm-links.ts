import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import { Resolver } from "../resolver.js";
import { detailKinds } from "../api/constants.js";
import type { Contact, Detail, DetailKind, DetailOwner, Organization, WeeekClient } from "../client.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import { crmOwnerShape, dealRef, findDeal, resolveCrmOwner, type CrmOwner } from "./crm-refs.js";

type ContactHost = Exclude<CrmOwner, { kind: "contact" }>;

const contactLinkShape = { contact: nameOrId.describe("The contact, by full name or id."), deal: dealRef.deal.optional(), funnel: dealRef.funnel, status: dealRef.status, organization: nameOrId.optional() };
type ContactLinkArgs = z.infer<z.ZodObject<typeof contactLinkShape>>;

/** The deal or the organization a contact is linked to — exactly one. */
async function resolveContactHost(resolver: Resolver, args: ContactLinkArgs): Promise<ContactHost> {
  if ((args.deal === undefined) === (args.organization === undefined)) throw new Error("pass exactly one of deal or organization");
  if (args.deal !== undefined) return { kind: "deal", id: (await findDeal(resolver, { deal: args.deal, funnel: args.funnel, status: args.status })).id };
  return { kind: "organization", id: await resolver.resolve({ kind: "organization", value: args.organization as string | number }) };
}

/** The owner's fresh object, for tools that return what they changed. */
async function readOwner(client: WeeekClient, owner: CrmOwner): Promise<unknown> {
  switch (owner.kind) {
    case "deal": return client.crm.deals.get(owner.id);
    case "organization": return client.crm.organizations.get(owner.id);
    case "contact": return client.crm.contacts.get(owner.id);
    default: { const _exhaustive: never = owner; throw new Error(`unhandled owner ${String(_exhaustive)}`); }
  }
}

const detailOwnerShape = { organization: nameOrId.optional().describe("The organization, by name or id."), contact: nameOrId.optional().describe("The contact, by full name or id.") };
const detailKind = z.enum(detailKinds);
type DetailOwnerArgs = z.infer<z.ZodObject<typeof detailOwnerShape>> & { kind: DetailKind };
interface FoundDetailOwner { owner: DetailOwner; entity: Organization | Contact; }

/** The organization or the contact the detail belongs to, with its current details; an address on a contact is refused before any call. */
async function findDetailOwner(resolver: Resolver, args: DetailOwnerArgs): Promise<FoundDetailOwner> {
  if ((args.organization === undefined) === (args.contact === undefined)) throw new Error("pass exactly one of organization or contact");
  if (args.organization !== undefined) {
    const entity = await resolver.find({ kind: "organization", value: args.organization });
    return { owner: { kind: "organization", id: entity.id }, entity };
  }
  if (args.kind === "address") throw new Error("a contact has no addresses; only organizations do");
  const entity = await resolver.find({ kind: "contact", value: args.contact as string | number });
  return { owner: { kind: "contact", id: entity.id }, entity };
}

function detailsOf(entity: Organization | Contact, kind: DetailKind): Detail[] {
  switch (kind) {
    case "address": return "addresses" in entity ? entity.addresses : [];
    case "email": return entity.emails;
    case "phone": return entity.phones;
    default: { const _exhaustive: never = kind; throw new Error(`unhandled detail kind ${String(_exhaustive)}`); }
  }
}

/** A detail by its value or id, from the owner's own list — no API call. */
function pickDetail({ entity }: FoundDetailOwner, kind: DetailKind, value: string | number): Detail {
  const named = detailsOf(entity, kind).map((detail) => ({ id: detail.id, name: detail.value }));
  const picked = Resolver.pickEntry(`${kind} of ${entity.name}`, String(value), named);
  return { id: picked.id, value: picked.name };
}

/** Links shared by deals, organizations and contacts: contacts, tags, and the address/email/phone details. */
export function registerCrmLinkTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_attach_contact", {
    description: "Link a CRM contact (by full name or id) to a deal (by id, or by title with `funnel`/`status`) or to an organization (by name or id) — exactly one. Returns the deal or organization.",
    inputSchema: contactLinkShape,
  }, async (args) => {
    const host = await resolveContactHost(resolver, args);
    const contactId = await resolver.resolve({ kind: "contact", value: args.contact });
    if (host.kind === "deal") await client.crm.deals.addContact({ dealId: host.id, contactId });
    else await client.crm.organizations.addContact({ organizationId: host.id, contactId });
    resolver.forget({ kind: host.kind });
    return readOwner(client, host);
  });

  registerJsonTool(server, "weeek_detach_contact", {
    description: "Unlink a CRM contact from a deal or an organization (exactly one). Requires confirm:true. Returns the deal or organization.",
    inputSchema: { ...contactLinkShape, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const host = await resolveContactHost(resolver, args);
    const contactId = await resolver.resolve({ kind: "contact", value: args.contact });
    if (host.kind === "deal") await client.crm.deals.removeContact({ dealId: host.id, contactId });
    else await client.crm.organizations.removeContact({ organizationId: host.id, contactId });
    resolver.forget({ kind: host.kind });
    return readOwner(client, host);
  });

  registerJsonTool(server, "weeek_add_crm_tag", {
    description: "Put a workspace tag (by title or id) on a deal, an organization or a contact — exactly one. Returns the tagged object.",
    inputSchema: { tag: nameOrId, ...crmOwnerShape },
  }, async (args) => {
    const owner = await resolveCrmOwner(resolver, args);
    const tagId = await resolver.resolve({ kind: "tag", value: args.tag });
    switch (owner.kind) {
      case "deal": await client.crm.deals.addTag({ dealId: owner.id, tagId }); break;
      case "organization": await client.crm.organizations.addTag({ organizationId: owner.id, tagId }); break;
      case "contact": await client.crm.contacts.addTag({ contactId: owner.id, tagId }); break;
      default: { const _exhaustive: never = owner; throw new Error(`unhandled owner ${String(_exhaustive)}`); }
    }
    resolver.forget({ kind: owner.kind });
    return readOwner(client, owner);
  });

  registerJsonTool(server, "weeek_remove_crm_tag", {
    description: "Take a workspace tag (by title or id) off a deal, an organization or a contact — exactly one. Requires confirm:true. Returns the object.",
    inputSchema: { tag: nameOrId, ...crmOwnerShape, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const owner = await resolveCrmOwner(resolver, args);
    const tagId = await resolver.resolve({ kind: "tag", value: args.tag });
    switch (owner.kind) {
      case "deal": await client.crm.deals.removeTag({ dealId: owner.id, tagId }); break;
      case "organization": await client.crm.organizations.removeTag({ organizationId: owner.id, tagId }); break;
      case "contact": await client.crm.contacts.removeTag({ contactId: owner.id, tagId }); break;
      default: { const _exhaustive: never = owner; throw new Error(`unhandled owner ${String(_exhaustive)}`); }
    }
    resolver.forget({ kind: owner.kind });
    return readOwner(client, owner);
  });

  registerJsonTool(server, "weeek_add_detail", {
    description: "Add an address, email or phone (`kind`) to a CRM organization or contact (exactly one; contacts have no addresses).",
    inputSchema: { ...detailOwnerShape, kind: detailKind, value: z.string().min(1) },
  }, async (args) => {
    const { owner } = await findDetailOwner(resolver, args);
    const detail = await client.crm.details.add({ owner, kind: args.kind, value: args.value });
    resolver.forget({ kind: owner.kind });
    return detail;
  });

  registerJsonTool(server, "weeek_update_detail", {
    description: "Change one address, email or phone of a CRM organization or contact: `detail` is its current value or id, `value` the new one.",
    inputSchema: { ...detailOwnerShape, kind: detailKind, detail: nameOrId, value: z.string().min(1) },
  }, async (args) => {
    const found = await findDetailOwner(resolver, args);
    const detail = await client.crm.details.update({ owner: found.owner, kind: args.kind, detailId: pickDetail(found, args.kind, args.detail).id, value: args.value });
    resolver.forget({ kind: found.owner.kind });
    return detail;
  });

  registerJsonTool(server, "weeek_delete_detail", {
    description: "Remove one address, email or phone (`detail`: its current value or id) from a CRM organization or contact. Irreversible; requires confirm:true.",
    inputSchema: { ...detailOwnerShape, kind: detailKind, detail: nameOrId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const found = await findDetailOwner(resolver, args);
    const removal = await client.crm.details.remove({ owner: found.owner, kind: args.kind, detailId: pickDetail(found, args.kind, args.detail).id });
    resolver.forget({ kind: found.owner.kind });
    return removal;
  });
}
