import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { asRecord, pickArray } from "./responses.js";
import type { NewPortfolio, Portfolio, PortfolioPage, PortfolioQuery, SuccessResponse } from "./types.js";

export interface UpdatePortfolioOptions { portfolioId: number; name: string; }

const ops = operations.portfolios;

export function toPortfolio(raw: unknown): Portfolio {
  const r = asRecord(raw);
  return { id: Number(r.id), name: String(r.name ?? ""), parentId: r.parentId == null ? null : Number(r.parentId), isPrivate: Boolean(r.isPrivate) };
}

export class PortfoliosApi {
  constructor(private http: HttpClient) {}

  async list(query: PortfolioQuery = {}): Promise<PortfolioPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    return { portfolios: pickArray(json, "data").map(toPortfolio), hasMore: Boolean(json.hasMore) };
  }

  async get(portfolioId: number): Promise<Portfolio> {
    const json = await this.http.execute<{ data: unknown }>(ops.get, { params: { portfolioId } });
    return toPortfolio(json.data);
  }

  async create(newPortfolio: NewPortfolio): Promise<Portfolio> {
    const json = await this.http.execute<{ data: unknown }>(ops.create, { body: newPortfolio });
    return toPortfolio(json.data);
  }

  async update({ portfolioId, name }: UpdatePortfolioOptions): Promise<Portfolio> {
    const json = await this.http.execute<{ data: unknown }>(ops.update, { params: { portfolioId }, body: { name } });
    return toPortfolio(json.data);
  }

  async remove(portfolioId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { portfolioId } });
  }
}
