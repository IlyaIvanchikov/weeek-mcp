import { z } from "zod";
import type { Resolver } from "../resolver.js";
import type { CustomField, FieldValue } from "../client.js";
import { parseDateTime } from "../dates.js";
import { resolveMembers } from "./members.js";
import { pickField, pickOption } from "./field-refs.js";

/** What a caller may pass for one field; null clears it. */
export const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
export const fieldValues = z.record(z.string(), fieldValue).describe(
  "Custom-field values by field name or id. text/link: a string; number: a number; boolean: true/false; datetime: a natural-language date or time; select: an option name; multiselect: option names; member/approval: member names; contact: a contact id; null clears the field.",
);
export type FieldValues = z.infer<typeof fieldValues>;

export interface EncodeFieldValuesOptions { resolver: Resolver; fields: CustomField[]; values: FieldValues; }

/** The `customFields` body: field ids to wire values, each name resolved the way its field's type needs. */
export async function encodeFieldValues({ resolver, fields, values }: EncodeFieldValuesOptions): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = pickField(fields, key);
    body[field.id] = value === null ? null : await encodeFieldValue(resolver, field, value);
  }
  return body;
}

type GivenValue = Exclude<FieldValue, null>;

function wrongShape(field: CustomField, wanted: string): Error {
  return new Error(`custom field "${field.name}" (${field.type}) takes ${wanted}`);
}
function wantString(field: CustomField, value: GivenValue, wanted: string): string {
  if (typeof value !== "string") throw wrongShape(field, wanted);
  return value;
}
function wantList(field: CustomField, value: GivenValue, wanted: string): string[] {
  if (!Array.isArray(value)) throw wrongShape(field, wanted);
  return value;
}

async function encodeFieldValue(resolver: Resolver, field: CustomField, value: GivenValue): Promise<unknown> {
  switch (field.type) {
    case "text": case "link": return wantString(field, value, "a string");
    case "number":
      if (typeof value !== "number") throw wrongShape(field, "a number");
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw wrongShape(field, "true or false");
      return value;
    case "datetime": return parseDateTime(wantString(field, value, "a date or time"));
    case "select": return pickOption(field, wantString(field, value, "one option name or id")).id;
    case "multiselect": return wantList(field, value, "a list of option names or ids").map((item) => pickOption(field, item).id);
    case "member": case "approval": return resolveMembers(resolver, wantList(field, value, "a list of member names or ids"));
    case "contact": return wantString(field, value, "a contact id");
    case null: throw new Error(`custom field "${field.name}" has a type this server does not know; set it in WEEEK`);
    default: { const _exhaustive: never = field.type; throw new Error(`unhandled field type ${String(_exhaustive)}`); }
  }
}
