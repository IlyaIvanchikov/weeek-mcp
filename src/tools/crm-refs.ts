import { z } from "zod";
import type { EntryOf, Resolver } from "../resolver.js";
import { nameOrId } from "./inputs.js";

/** How every deal tool names its deal: by id alone, or by title with the funnel or status it is in. */
export const dealRef = {
  deal: nameOrId.describe("The deal, by title or by its 16-character id (an id needs no funnel or status)."),
  funnel: nameOrId.optional().describe("The deal's funnel (name or id), when the deal is given by title."),
  status: nameOrId.optional().describe("The deal's status, when the deal is given by title: by id, or by name together with `funnel`."),
};
export type DealRefArgs = z.infer<z.ZodObject<typeof dealRef>>;
export interface DealContext { funnelId?: string; statusId?: string; }

/** The funnel and the status a caller named, as ids; the status is looked up inside the funnel. */
export async function resolveDealContext(resolver: Resolver, { funnel, status }: Pick<DealRefArgs, "funnel" | "status">): Promise<DealContext> {
  const funnelId = funnel === undefined ? undefined : await resolver.resolve({ kind: "funnel", value: funnel });
  const statusId = status === undefined ? undefined : await resolver.resolve({ kind: "status", value: status, scope: { funnelId } });
  if (funnelId !== undefined && statusId !== undefined) {
    // A status given by id passes through unchecked; make sure it belongs to the funnel the caller named.
    const funnelStatuses = await resolver.list({ kind: "status", scope: { funnelId } });
    if (!funnelStatuses.some((funnelStatus) => funnelStatus.id === statusId)) throw new Error(`status ${status} is not in funnel ${funnel}`);
  }
  return { funnelId, statusId };
}

/** The deal with its funnel and status ids — what every deal tool starts from. */
export async function findDeal(resolver: Resolver, args: DealRefArgs): Promise<EntryOf<"deal">> {
  const context = await resolveDealContext(resolver, args);
  return resolver.find({ kind: "deal", value: args.deal, scope: context });
}

export const statusRef = {
  status: nameOrId.describe("The status, by id, or by name together with `funnel`."),
  funnel: nameOrId.optional().describe("The status's funnel (name or id), when the status is given by name."),
};
export type StatusRefArgs = z.infer<z.ZodObject<typeof statusRef>>;

export async function resolveStatus(resolver: Resolver, { status, funnel }: StatusRefArgs): Promise<string> {
  const funnelId = funnel === undefined ? undefined : await resolver.resolve({ kind: "funnel", value: funnel });
  return resolver.resolve({ kind: "status", value: status, scope: { funnelId } });
}

/** The thing a shared CRM tool acts on: exactly one of a deal, an organization or a contact. */
export const crmOwnerShape = {
  deal: nameOrId.optional().describe("A deal, by title (with `funnel` or `status`) or by id."),
  funnel: dealRef.funnel,
  status: dealRef.status,
  organization: nameOrId.optional().describe("An organization, by name or id."),
  contact: nameOrId.optional().describe("A contact, by full name or id."),
};
export type CrmOwnerArgs = z.infer<z.ZodObject<typeof crmOwnerShape>>;
export type CrmOwner = { kind: "deal"; id: string } | { kind: "organization"; id: string } | { kind: "contact"; id: string };

export async function resolveCrmOwner(resolver: Resolver, args: CrmOwnerArgs): Promise<CrmOwner> {
  const given = [args.deal, args.organization, args.contact].filter((value) => value !== undefined).length;
  if (given !== 1) throw new Error("pass exactly one of deal, organization or contact");
  if (args.deal !== undefined) return { kind: "deal", id: (await findDeal(resolver, { deal: args.deal, funnel: args.funnel, status: args.status })).id };
  if (args.organization !== undefined) return { kind: "organization", id: await resolver.resolve({ kind: "organization", value: args.organization }) };
  return { kind: "contact", id: await resolver.resolve({ kind: "contact", value: args.contact as string | number }) };
}
