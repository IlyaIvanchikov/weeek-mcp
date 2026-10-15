import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, pickArray, stringList } from "../responses.js";
import { apiFlag } from "../requests.js";
import { toCustomField } from "../custom-fields.js";
import type { Funnel, FunnelUpdate, NewFunnel, SuccessResponse } from "../types.js";

export interface UpdateFunnelOptions { funnelId: string; update: FunnelUpdate; }

const ops = operations.funnels;

export function toFunnel(raw: unknown): Funnel {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    currencyId: r.currencyId == null ? null : Number(r.currencyId),
    isPrivate: Boolean(r.isPrivate),
    dealsCount: Number(r.dealsCount ?? 0),
    dealsAmount: Number(r.dealsAmount ?? 0),
    team: stringList(r.team),
    customFields: Array.isArray(r.customFields) ? r.customFields.map(toCustomField) : [],
  };
}

export class FunnelsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Funnel[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list);
    return pickArray(json, "funnels").map(toFunnel);
  }

  async get(funnelId: string): Promise<Funnel> {
    const json = await this.http.execute<{ funnel: unknown }>(ops.get, { params: { funnelId } });
    return toFunnel(json.funnel);
  }

  async create(newFunnel: NewFunnel): Promise<Funnel> {
    const json = await this.http.execute<{ funnel: unknown }>(ops.create, { body: { ...newFunnel, isPrivate: apiFlag(newFunnel.isPrivate) } });
    return toFunnel(json.funnel);
  }

  async update({ funnelId, update }: UpdateFunnelOptions): Promise<Funnel> {
    const json = await this.http.execute<{ funnel: unknown }>(ops.update, { params: { funnelId }, body: { ...update, isPrivate: apiFlag(update.isPrivate) } });
    return toFunnel(json.funnel);
  }

  async remove(funnelId: string): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { funnelId } });
  }
}
