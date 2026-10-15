import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, pickArray } from "../responses.js";
import type { Currency } from "../types.js";

export function toCurrency(raw: unknown): Currency {
  const r = asRecord(raw);
  return { id: Number(r.id), name: String(r.name ?? ""), code: String(r.code ?? ""), symbol: String(r.symbol ?? "") };
}

export class CurrenciesApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Currency[]> {
    const json = await this.http.execute<Record<string, unknown>>(operations.currencies.list);
    return pickArray(json, "currencies").map(toCurrency);
  }
}
