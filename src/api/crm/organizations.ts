import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, pageHasMore, pickArray, stringList, tagIdList } from "../responses.js";
import { orNullWhenMissing } from "../requests.js";
import { toDetails } from "./details.js";
import type { CrmQuery, NewOrganization, Organization, OrganizationPage, OrganizationUpdate, SuccessResponse } from "../types.js";

export interface UpdateOrganizationOptions { organizationId: string; update: OrganizationUpdate; }
export interface OrganizationContactOptions { organizationId: string; contactId: string; }
export interface OrganizationTagOptions { organizationId: string; tagId: number; }

const ops = operations.organizations;

export function toOrganization(raw: unknown): Organization {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    responsibleId: r.responsibleId == null ? null : String(r.responsibleId),
    addresses: toDetails(r.addresses, "address"),
    emails: toDetails(r.emails, "email"),
    phones: toDetails(r.phones, "phone"),
    contacts: stringList(r.contacts),
    tags: tagIdList(r.tags),
  };
}

export class OrganizationsApi {
  constructor(private http: HttpClient) {}

  async list(query: CrmQuery = {}): Promise<OrganizationPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    const organizations = pickArray(json, "organizations").map(toOrganization);
    return { organizations, hasMore: pageHasMore(organizations.length, query.limit) };
  }

  async get(organizationId: string): Promise<Organization> {
    const json = await this.http.execute<{ organization: unknown }>(ops.get, { params: { organizationId } });
    return toOrganization(json.organization);
  }

  async tryGet(organizationId: string): Promise<Organization | null> {
    return orNullWhenMissing(this.get(organizationId));
  }

  async create(newOrganization: NewOrganization): Promise<Organization> {
    const json = await this.http.execute<{ organization: unknown }>(ops.create, { body: newOrganization });
    return toOrganization(json.organization);
  }

  async update({ organizationId, update }: UpdateOrganizationOptions): Promise<Organization> {
    const json = await this.http.execute<{ organization: unknown }>(ops.update, { params: { organizationId }, body: update });
    return toOrganization(json.organization);
  }

  async remove(organizationId: string): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { organizationId } });
  }

  async addContact({ organizationId, contactId }: OrganizationContactOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addContact, { params: { organizationId }, body: { contactId } });
  }

  async removeContact({ organizationId, contactId }: OrganizationContactOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeContact, { params: { organizationId }, body: { contactId } });
  }

  async addTag({ organizationId, tagId }: OrganizationTagOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addTag, { params: { organizationId }, body: { tagId } });
  }

  async removeTag({ organizationId, tagId }: OrganizationTagOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeTag, { params: { organizationId }, body: { tagId } });
  }
}
