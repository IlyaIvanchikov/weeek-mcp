import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { pickArray } from "./responses.js";
import type { NewPortfolio, Portfolio, PortfolioPage, PortfolioQuery, SuccessResponse } from "./types.js";

export interface UpdatePortfolioOptions { portfolioId: number; name: string; }

const ops = operations.portfolios;

export function toPortfolio(raw: any): Portfolio {
  return { id: Number(raw.id), name: String(raw.name ?? ""), parentId: raw.parentId == null ? null : Number(raw.parentId), isPrivate: Boolean(raw.isPrivate) };
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
    const body: Record<string, unknown> = { name: newPortfolio.name };
    if (newPortfolio.parentId !== undefined) body.parentId = newPortfolio.parentId;
    const json = await this.http.execute<{ data: unknown }>(ops.create, { body });
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
