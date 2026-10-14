import { describe, it, expect, vi } from "vitest";
import { Resolver } from "../../src/resolver.js";
import { NameCache } from "../../src/cache.js";
import { buildFieldConfig, parseFieldScope, parsePlacement, parseTransferTarget, pickField, pickOption } from "../../src/tools/field-refs.js";
import type { CustomField } from "../../src/client.js";

const review = { id: "0b1e4d7c-2222-4aaa-8bbb-000000000002", name: "Review", color: "blue" };
const done = { id: "0b1e4d7c-3333-4aaa-8bbb-000000000003", name: "Done", color: "green" };
const stage: CustomField = { id: "0b1e4d7c-1111-4aaa-8bbb-000000000001", name: "Stage", type: "select", config: null, options: [review, done] };
const estimate: CustomField = { id: "0b1e4d7c-4444-4aaa-8bbb-000000000004", name: "Estimate", type: "number", config: { type: "number", precision: 0 }, options: [] };
const resolver = () => new Resolver({
  projects: { list: vi.fn(async () => [{ id: 1, name: "Marketing" }]) },
  boards: { list: vi.fn(async (_pid: number) => [{ id: 10, name: "Main" }]) },
  crm: { funnels: { list: vi.fn(async () => [{ id: "OLY24hy2mC7n9D9l", name: "Sales", customFields: [] }]) } },
} as any, new NameCache(100_000, () => 0));

describe("parseFieldScope", () => {
  it("turns each scope and its owner into one FieldScope", async () => {
    const r = resolver();
    expect(await parseFieldScope(r, { scope: "global" })).toEqual({ kind: "global" });
    expect(await parseFieldScope(r, { scope: "project", project: "marketing" })).toEqual({ kind: "project", projectId: 1 });
    expect(await parseFieldScope(r, { scope: "board", board: "main", project: 1 })).toEqual({ kind: "board", boardId: 10 });
    expect(await parseFieldScope(r, { scope: "board", board: 10 })).toEqual({ kind: "board", boardId: 10 });
    expect(await parseFieldScope(r, { scope: "funnel", funnel: "sales" })).toEqual({ kind: "funnel", funnelId: "OLY24hy2mC7n9D9l" });
  });
  it("names the missing owner", async () => {
    await expect(parseFieldScope(resolver(), { scope: "project" })).rejects.toThrow(/scope "project" needs `project` \(name or id\)/);
    await expect(parseFieldScope(resolver(), { scope: "board", board: "Main" })).rejects.toThrow(/needs a project \(name or id\)/);
    await expect(parseFieldScope(resolver(), { scope: "funnel" })).rejects.toThrow(/scope "funnel" needs `funnel`/);
  });
});

describe("parseTransferTarget", () => {
  it("resolves the target owner", async () => {
    const r = resolver();
    expect(await parseTransferTarget(r, { to: "global" })).toEqual({ kind: "global" });
    expect(await parseTransferTarget(r, { to: "project", to_project: "Marketing" })).toEqual({ kind: "project", projectId: 1 });
    expect(await parseTransferTarget(r, { to: "board", to_board: "Main", to_project: "Marketing" })).toEqual({ kind: "board", boardId: 10 });
    await expect(parseTransferTarget(r, { to: "board" })).rejects.toThrow(/needs `to_board`/);
  });
});

describe("buildFieldConfig", () => {
  it("builds a number config with defaults, merging over the current one", () => {
    expect(buildFieldConfig({ type: "number", args: { precision: 2 } })).toEqual({ type: "number", precision: 2 });
    expect(buildFieldConfig({ type: "number", args: { number_format: "currency", currency_id: 3 } })).toEqual({ type: "currency", precision: 0, currency: 3 });
    expect(buildFieldConfig({ type: "number", args: { precision: 1 }, current: { type: "percent", precision: 0 } })).toEqual({ type: "percent", precision: 1 });
    expect(buildFieldConfig({ type: "number", args: {} })).toBeUndefined();
  });
  it("builds a boolean config only when a style is given", () => {
    expect(buildFieldConfig({ type: "boolean", args: { boolean_style: "radio" } })).toEqual({ type: "radio" });
    expect(buildFieldConfig({ type: "boolean", args: {}, current: { type: "checkbox" } })).toBeUndefined();
  });
  it("refuses settings that belong to another type", () => {
    expect(() => buildFieldConfig({ type: "number", args: { boolean_style: "radio" } })).toThrow(/boolean_style applies to boolean fields/);
    expect(() => buildFieldConfig({ type: "boolean", args: { precision: 1 } })).toThrow(/apply to number fields/);
    expect(() => buildFieldConfig({ type: "text", args: { precision: 1 } })).toThrow(/a text field has no number or boolean settings/);
    expect(() => buildFieldConfig({ type: null, args: { precision: 1 } })).toThrow(/not known/);
    expect(buildFieldConfig({ type: "text", args: {} })).toBeUndefined();
  });
});

describe("pickField and pickOption", () => {
  it("match by id or by name, with candidates on a miss", () => {
    expect(pickField([stage, estimate], "estimate")).toBe(estimate);
    expect(pickField([stage, estimate], stage.id)).toBe(stage);
    expect(() => pickField([stage, estimate], "Est")).toThrow(/could not resolve custom field "Est"; candidates: Estimate/);
    expect(pickOption(stage, "done")).toBe(done);
    expect(pickOption(stage, review.id)).toBe(review);
    expect(() => pickOption(stage, "Reviw")).toThrow(/could not resolve option of Stage "Reviw"; candidates: none/);
  });
});

describe("parsePlacement", () => {
  const idOf = (value: string | number) => pickOption(stage, value).id;
  it("sends exactly the one neighbour given, resolved", () => {
    expect(parsePlacement({ after: "done" }, idOf)).toEqual({ after: done.id });
    expect(parsePlacement({ before: review.id }, idOf)).toEqual({ before: review.id });
  });
  it("refuses both and neither", () => {
    expect(() => parsePlacement({ after: "done", before: "review" }, idOf)).toThrow(/exactly one of after or before/);
    expect(() => parsePlacement({}, idOf)).toThrow(/exactly one of after or before/);
  });
});
