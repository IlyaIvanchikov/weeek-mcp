import { z } from "zod";
import { Resolver } from "../resolver.js";
import { booleanStyles, fieldScopes, numberFormats, transferTargetKinds } from "../api/constants.js";
import type { CustomField, CustomFieldOption, FieldConfig, FieldScope, FieldType, NumberFieldConfig, Placement, TransferTarget } from "../client.js";
import { nameOrId } from "./inputs.js";

/** The parameters every custom-field tool takes to say which scope it works in. */
export const fieldScopeShape = {
  scope: z.enum(fieldScopes).describe("Where the field lives: global (every task), a project, a board or a CRM funnel."),
  project: nameOrId.optional().describe("For scope:project; for scope:board, the board's project when `board` is a name."),
  board: nameOrId.optional().describe("For scope:board: the board by id, or by name together with `project`."),
  funnel: nameOrId.optional().describe("For scope:funnel: the CRM funnel by name or id."),
};
export type FieldScopeArgs = z.infer<z.ZodObject<typeof fieldScopeShape>>;

export const transferShape = {
  to: z.enum(transferTargetKinds).describe("The scope to send the field to."),
  to_project: nameOrId.optional().describe("For to:project; for to:board, the board's project when `to_board` is a name."),
  to_board: nameOrId.optional().describe("For to:board: the board by id, or by name together with `to_project`."),
};
export type TransferArgs = z.infer<z.ZodObject<typeof transferShape>>;

interface BoardRef { board: string | number; project?: string | number; }

function requireOwner<T>(value: T | undefined, where: string, parameter: string): T {
  if (value === undefined) throw new Error(`${where} needs \`${parameter}\` (name or id)`);
  return value;
}

async function resolveBoard(resolver: Resolver, { board, project }: BoardRef): Promise<number> {
  const projectId = project === undefined ? undefined : await resolver.resolve({ kind: "project", value: project });
  return resolver.resolve({ kind: "board", value: board, scope: { projectId } });
}

/** The tool is the boundary that narrows the scope enum into one FieldScope variant, resolving the owner's name. */
export async function parseFieldScope(resolver: Resolver, args: FieldScopeArgs): Promise<FieldScope> {
  switch (args.scope) {
    case "global": return { kind: "global" };
    case "project": return { kind: "project", projectId: await resolver.resolve({ kind: "project", value: requireOwner(args.project, 'scope "project"', "project") }) };
    case "board": return { kind: "board", boardId: await resolveBoard(resolver, { board: requireOwner(args.board, 'scope "board"', "board"), project: args.project }) };
    case "funnel": return { kind: "funnel", funnelId: await resolver.resolve({ kind: "funnel", value: requireOwner(args.funnel, 'scope "funnel"', "funnel") }) };
    default: { const _exhaustive: never = args.scope; throw new Error(`unhandled scope ${String(_exhaustive)}`); }
  }
}

export async function parseTransferTarget(resolver: Resolver, args: TransferArgs): Promise<TransferTarget> {
  switch (args.to) {
    case "global": return { kind: "global" };
    case "project": return { kind: "project", projectId: await resolver.resolve({ kind: "project", value: requireOwner(args.to_project, 'to:"project"', "to_project") }) };
    case "board": return { kind: "board", boardId: await resolveBoard(resolver, { board: requireOwner(args.to_board, 'to:"board"', "to_board"), project: args.to_project }) };
    default: { const _exhaustive: never = args.to; throw new Error(`unhandled transfer target ${String(_exhaustive)}`); }
  }
}

/** A field by name or id from a list already in hand — no API call. */
export function pickField(fields: CustomField[], value: string | number): CustomField {
  return Resolver.pickEntry("custom field", String(value), fields);
}

/** A field's option by name or id from the field's own list — no API call. */
export function pickOption(field: CustomField, value: string | number): CustomFieldOption {
  return Resolver.pickEntry(`option of ${field.name}`, String(value), field.options);
}

/** Number and boolean settings, flattened so a caller never writes the API's nested `config`. */
export const fieldConfigShape = {
  number_format: z.enum(numberFormats).optional().describe("Number fields: shown as a plain number, a currency or a percent."),
  precision: z.number().int().min(0).max(6).optional().describe("Number fields: decimal places, 0–6."),
  currency_id: z.number().int().min(1).max(10).optional().describe("Number fields shown as currency: a WEEEK currency id, 1–10."),
  boolean_style: z.enum(booleanStyles).optional().describe("Boolean fields: radio or checkbox."),
};
export type FieldConfigArgs = z.infer<z.ZodObject<typeof fieldConfigShape>>;

export interface BuildFieldConfigOptions { type: FieldType | null; args: FieldConfigArgs; current?: FieldConfig | null; }

/**
 * The settings the API wants for a field of `type`, merged over `current`, or undefined when
 * nothing is to be sent. Settings that belong to another type are refused, not dropped.
 */
export function buildFieldConfig({ type, args, current = null }: BuildFieldConfigOptions): FieldConfig | undefined {
  const hasNumberArgs = args.number_format !== undefined || args.precision !== undefined || args.currency_id !== undefined;
  const hasBooleanArgs = args.boolean_style !== undefined;
  if (type === null) {
    if (hasNumberArgs || hasBooleanArgs) throw new Error("this field's type is not known to the server, so its settings cannot be changed here");
    return undefined;
  }
  switch (type) {
    case "number": {
      if (hasBooleanArgs) throw new Error("boolean_style applies to boolean fields only");
      const base = current !== null && "precision" in current ? current : null;
      if (!hasNumberArgs) return undefined;
      const config: NumberFieldConfig = { type: args.number_format ?? base?.type ?? "number", precision: args.precision ?? base?.precision ?? 0 };
      // A currency id only means something to a currency field; a stale one would ride along into another format.
      const currency = args.currency_id ?? base?.currency;
      if (config.type === "currency" && currency !== undefined) config.currency = currency;
      return config;
    }
    case "boolean":
      if (hasNumberArgs) throw new Error("number_format, precision and currency_id apply to number fields only");
      return args.boolean_style === undefined ? undefined : { type: args.boolean_style };
    case "text": case "datetime": case "select": case "multiselect": case "member": case "contact": case "link": case "approval":
      if (hasNumberArgs || hasBooleanArgs) throw new Error(`a ${type} field has no number or boolean settings`);
      return undefined;
    default: { const _exhaustive: never = type; throw new Error(`unhandled field type ${String(_exhaustive)}`); }
  }
}

export const placementShape = {
  after: nameOrId.optional().describe("Place it right after this sibling (name or id)."),
  before: nameOrId.optional().describe("Place it right before this sibling (name or id)."),
};
export type PlacementArgs = z.infer<z.ZodObject<typeof placementShape>>;

/** Exactly one neighbour, resolved to its id by `idOf`; the API refuses both and neither. */
export function parsePlacement(args: PlacementArgs, idOf: (value: string | number) => string): Placement {
  if (args.after !== undefined && args.before === undefined) return { after: idOf(args.after) };
  if (args.before !== undefined && args.after === undefined) return { before: idOf(args.before) };
  throw new Error("pass exactly one of after or before");
}
