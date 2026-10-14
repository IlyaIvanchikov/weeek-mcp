import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, pickArray } from "../responses.js";
import { toCustomField } from "../custom-fields.js";
import type { Funnel } from "../types.js";

export function toFunnel(raw: unknown): Funnel {
  const r = asRecord(raw);
  return { id: String(r.id ?? ""), name: String(r.name ?? ""), customFields: Array.isArray(r.customFields) ? r.customFields.map(toCustomField) : [] };
}

/** Phase 3 needs only the list (funnel names and their fields); Phase 4 adds the rest. */
export class FunnelsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Funnel[]> {
    const json = await this.http.execute<Record<string, unknown>>(operations.funnels.list);
    return pickArray(json, "funnels").map(toFunnel);
  }
}
