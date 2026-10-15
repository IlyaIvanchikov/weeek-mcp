import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, pickArray } from "../responses.js";
import { orNullWhenMissing } from "../requests.js";
import type { FunnelStatus, SuccessResponse } from "../types.js";

export interface CreateStatusOptions { funnelId: string; name: string; }
export interface UpdateStatusOptions { statusId: string; name: string; }

const ops = operations.statuses;

export function toStatus(raw: unknown): FunnelStatus {
  const r = asRecord(raw);
  return { id: String(r.id ?? ""), name: String(r.name ?? ""), dealsCount: Number(r.dealsCount ?? 0), dealsAmount: Number(r.dealsAmount ?? 0) };
}

export class StatusesApi {
  constructor(private http: HttpClient) {}

  async list(funnelId: string): Promise<FunnelStatus[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { params: { funnelId } });
    return pickArray(json, "statuses").map(toStatus);
  }

  async get(statusId: string): Promise<FunnelStatus> {
    const json = await this.http.execute<{ status: unknown }>(ops.get, { params: { statusId } });
    return toStatus(json.status);
  }

  /** The status, or null when no status has that id — a status id needs no funnel (Task 6's lookup). */
  async tryGet(statusId: string): Promise<FunnelStatus | null> {
    return orNullWhenMissing(this.get(statusId));
  }

  async create({ funnelId, name }: CreateStatusOptions): Promise<FunnelStatus> {
    const json = await this.http.execute<{ status: unknown }>(ops.create, { params: { funnelId }, body: { name } });
    return toStatus(json.status);
  }

  async update({ statusId, name }: UpdateStatusOptions): Promise<FunnelStatus> {
    const json = await this.http.execute<{ status: unknown }>(ops.update, { params: { statusId }, body: { name } });
    return toStatus(json.status);
  }

  async remove(statusId: string): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { statusId } });
  }
}
