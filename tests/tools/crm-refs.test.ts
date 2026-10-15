import { describe, it, expect, vi } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { findDeal, resolveCrmOwner, resolveDealContext, resolveStatus } from "../../src/tools/crm-refs.js";

const funnelId = "OLY24hy2mC7n9D9l";
const statusId = "XliVA5F0gguLo4Pw";
const dealId = "EcwB3DpREwmffxSP";
const organizationId = "a1f0e7ee-c748-4fdc-a197-52699622e4d6";
const contactId = "a1f0e7ee-cb63-430e-930f-f1592961439c";
const sale = { id: dealId, title: "Sale", statusId, funnelId };
const resolver = () => new Resolver({
  crm: {
    funnels: { list: vi.fn(async () => [{ id: funnelId, name: "Sales", customFields: [] }]) },
    statuses: { list: vi.fn(async () => [{ id: statusId, name: "New" }]), tryGet: vi.fn(async (id: string) => (id === statusId ? { id: statusId, name: "New" } : null)) },
    deals: { list: vi.fn(async () => ({ deals: [sale], hasMore: false })), tryGet: vi.fn(async (id: string) => (id === dealId ? sale : null)) },
    organizations: { list: vi.fn(async () => ({ organizations: [{ id: organizationId, name: "Acme" }], hasMore: false })), tryGet: vi.fn(async () => null) },
    contacts: { list: vi.fn(async () => ({ contacts: [{ id: contactId, name: "Ann Lee" }], hasMore: false })), tryGet: vi.fn(async () => null) },
  },
} as any, new NameCache(100_000, () => 0));

describe("resolveDealContext and findDeal", () => {
  it("resolves the funnel, then the status inside it", async () => {
    expect(await resolveDealContext(resolver(), { funnel: "sales", status: "new" })).toEqual({ funnelId, statusId });
    expect(await resolveDealContext(resolver(), {})).toEqual({ funnelId: undefined, statusId: undefined });
  });
  it("finds a deal by id with no context and by title inside the context", async () => {
    expect((await findDeal(resolver(), { deal: dealId })).id).toBe(dealId);
    expect((await findDeal(resolver(), { deal: "sale", funnel: "Sales" })).id).toBe(dealId);
    await expect(findDeal(resolver(), { deal: "Sale" })).rejects.toThrow(/needs a funnel or a status/);
  });
});

describe("resolveStatus", () => {
  it("takes a status id alone, or a name with its funnel", async () => {
    expect(await resolveStatus(resolver(), { status: statusId })).toBe(statusId);
    expect(await resolveStatus(resolver(), { status: "new", funnel: "Sales" })).toBe(statusId);
    await expect(resolveStatus(resolver(), { status: "New" })).rejects.toThrow(/needs a funnel/);
  });
});

describe("resolveCrmOwner", () => {
  it("resolves exactly one of deal, organization or contact", async () => {
    expect(await resolveCrmOwner(resolver(), { deal: dealId })).toEqual({ kind: "deal", id: dealId });
    expect(await resolveCrmOwner(resolver(), { organization: "acme" })).toEqual({ kind: "organization", id: organizationId });
    expect(await resolveCrmOwner(resolver(), { contact: "Ann Lee" })).toEqual({ kind: "contact", id: contactId });
    await expect(resolveCrmOwner(resolver(), {})).rejects.toThrow(/exactly one of deal, organization or contact/);
    await expect(resolveCrmOwner(resolver(), { deal: dealId, contact: contactId })).rejects.toThrow(/exactly one of deal, organization or contact/);
  });
});
