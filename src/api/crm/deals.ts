import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, isOneOf, pickArray, stringList, tagIdList } from "../responses.js";
import { attachmentForm, orNullWhenMissing, pickAttachments } from "../requests.js";
import { dealOutcomes } from "../constants.js";
import { toFieldValue } from "../custom-fields.js";
import { toTask } from "../tasks.js";
import type { Attachment, Deal, DealPage, DealPatch, DealPlacement, DealQuery, DealReplacement, NewDeal, SuccessResponse, WeeekTask } from "../types.js";

export interface ListDealsOptions { statusId: string; query?: DealQuery; }
export interface CreateDealOptions { statusId: string; deal: NewDeal; }
export interface ReplaceDealOptions { dealId: string; replacement: DealReplacement; }
export interface UpdateDealOptions { dealId: string; patch: DealPatch; }
export interface MoveDealOptions { dealId: string; placement: DealPlacement; }
export interface DealFunnelOptions { dealId: string; funnelId: string; }
export interface DealStatusOptions { dealId: string; statusId: string; }
export interface DealMemberOptions { dealId: string; memberId: string; }
export interface DealContactOptions { dealId: string; contactId: string; }
export interface DealOrganizationOptions { dealId: string; organizationId: string; }
export interface DealTagOptions { dealId: string; tagId: number; }
export interface AddDealTaskOptions { dealId: string; title: string; description?: string; }
export interface MoveDealTaskOptions { dealId: string; taskId: number; previousTaskId: number | null; }
export interface DealTaskRef { dealId: string; taskId: number; }
export interface UploadDealAttachmentOptions { dealId: string; filename: string; bytes: Uint8Array | Blob; }

const ops = operations.deals;

/** The API calls a deal's outcome `winStatus`; everything else is sent as named. */
function dealBody(deal: NewDeal | DealPatch | DealReplacement): Record<string, unknown> {
  const { outcome, ...rest } = deal;
  const body: Record<string, unknown> = { ...rest };
  if (outcome !== undefined) body.winStatus = outcome;
  return body;
}

export function toDeal(raw: unknown): Deal {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""),
    title: String(r.title ?? ""),
    description: r.description == null ? null : String(r.description),
    funnelId: String(r.funnelId ?? ""),
    statusId: String(r.statusId ?? ""),
    amount: r.amount == null ? null : Number(r.amount),
    outcome: isOneOf(dealOutcomes, r.winStatus) ? r.winStatus : null,
    assignees: stringList(r.assignees),
    organizations: stringList(r.organizations),
    contacts: stringList(r.contacts),
    tags: tagIdList(r.tags),
    tasks: Array.isArray(r.tasks) ? r.tasks.map((task) => Number(asRecord(task).id)) : [],
    customFields: Array.isArray(r.customFields) ? r.customFields.map(toFieldValue) : [],
    attachments: Array.isArray(r.attachments) ? (r.attachments as Attachment[]) : [],
    createdAt: r.createdAt == null ? null : String(r.createdAt),
    updatedAt: r.updatedAt == null ? null : String(r.updatedAt),
  };
}

export class DealsApi {
  constructor(private http: HttpClient) {}

  async list({ statusId, query = {} }: ListDealsOptions): Promise<DealPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.listByStatus, { params: { statusId }, query });
    return { deals: pickArray(json, "deals").map(toDeal), hasMore: Boolean(json.hasMoreDeals) };
  }

  async get(dealId: string): Promise<Deal> {
    const json = await this.http.execute<{ deal: unknown }>(ops.get, { params: { dealId } });
    return toDeal(json.deal);
  }

  /** The deal, or null when no deal has that id — how the resolver tries an id-shaped value. */
  async tryGet(dealId: string): Promise<Deal | null> {
    return orNullWhenMissing(this.get(dealId));
  }

  async create({ statusId, deal }: CreateDealOptions): Promise<Deal> {
    const json = await this.http.execute<{ deal: unknown }>(ops.create, { params: { statusId }, body: dealBody(deal) });
    return toDeal(json.deal);
  }

  async replace({ dealId, replacement }: ReplaceDealOptions): Promise<Deal> {
    const json = await this.http.execute<{ deal: unknown }>(ops.replace, { params: { dealId }, body: dealBody(replacement) });
    return toDeal(json.deal);
  }

  // PATCH answers with success only, so the deal is re-read.
  async update({ dealId, patch }: UpdateDealOptions): Promise<Deal> {
    await this.http.execute<SuccessResponse>(ops.update, { params: { dealId }, body: dealBody(patch) });
    return this.get(dealId);
  }

  async remove(dealId: string): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { dealId } });
  }

  async move({ dealId, placement }: MoveDealOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.move, { params: { dealId }, body: placement });
  }

  async setFunnel({ dealId, funnelId }: DealFunnelOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.setFunnel, { params: { dealId }, body: { funnelId } });
  }

  async setStatus({ dealId, statusId }: DealStatusOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.setStatus, { params: { dealId }, body: { statusId } });
  }

  async addAssignee({ dealId, memberId }: DealMemberOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addAssignee, { params: { dealId }, body: { assigneeId: memberId } });
  }

  async removeAssignee({ dealId, memberId }: DealMemberOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeAssignee, { params: { dealId }, body: { assigneeId: memberId } });
  }

  async addContact({ dealId, contactId }: DealContactOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addContact, { params: { dealId }, body: { contactId } });
  }

  async removeContact({ dealId, contactId }: DealContactOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeContact, { params: { dealId }, body: { contactId } });
  }

  async addOrganization({ dealId, organizationId }: DealOrganizationOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addOrganization, { params: { dealId }, body: { organizationId } });
  }

  async removeOrganization({ dealId, organizationId }: DealOrganizationOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeOrganization, { params: { dealId }, body: { organizationId } });
  }

  async addTag({ dealId, tagId }: DealTagOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addTag, { params: { dealId }, body: { tag: tagId } });
  }

  async removeTag({ dealId, tagId }: DealTagOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeTag, { params: { dealId }, body: { tag: tagId } });
  }

  /** The spec declares no body; the title and description are sent on the premise the API creates the task from them (FOLLOWUPS 24 e). */
  async addTask({ dealId, title, description }: AddDealTaskOptions): Promise<WeeekTask> {
    const json = await this.http.execute<{ task: unknown }>(ops.addTask, { params: { dealId }, body: { title, description } });
    return toTask(json.task);
  }

  async moveTask({ dealId, taskId, previousTaskId }: MoveDealTaskOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.moveTask, { params: { dealId, taskId }, body: { previousTaskId } });
  }

  async removeTask({ dealId, taskId }: DealTaskRef): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeTask, { params: { dealId, taskId } });
  }

  async uploadAttachment({ dealId, filename, bytes }: UploadDealAttachmentOptions): Promise<Attachment[]> {
    const json = await this.http.execute<{ data?: unknown }>(ops.uploadAttachment, { params: { dealId }, body: attachmentForm({ filename, bytes }) });
    return pickAttachments(json);
  }
}
