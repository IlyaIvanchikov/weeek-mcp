import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { Resolver } from "../resolver.js";
import { fieldTypes, optionColors } from "../api/constants.js";
import { isOneOf } from "../api/responses.js";
import type { CustomField, FieldScope } from "../client.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";
import {
  buildFieldConfig, fieldConfigShape, fieldScopeShape, parseFieldScope, parsePlacement, parseTransferTarget,
  pickField, pickOption, placementShape, transferShape, type FieldScopeArgs,
} from "./field-refs.js";

const fieldRef = { ...fieldScopeShape, field: nameOrId.describe("The custom field, by name or id.") };
const optionRef = { ...fieldRef, option: nameOrId.describe("The option, by name or id.") };
const nameText = z.string().min(1).max(255);
const optionColor = z.enum(optionColors);

interface FoundField { scope: FieldScope; field: CustomField; }

/** The scope the arguments name, and the field inside it with its options and settings. */
async function findField(resolver: Resolver, args: FieldScopeArgs & { field: string | number }): Promise<FoundField> {
  const scope = await parseFieldScope(resolver, args);
  const field = await resolver.find({ kind: "customField", value: args.field, scope: { fieldScope: scope } });
  return { scope, field };
}

/** The custom-fields toolset: fields and their options, in every scope the API has. */
export function registerCustomFieldTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_list_custom_fields", {
    description: "List the custom fields of one scope — global (every task), a project, a board or a CRM funnel: id, name, type, number/boolean settings and select options. A board's fields are read off its tasks (the API lists them nowhere else), so an empty board shows none.",
    inputSchema: fieldScopeShape,
  }, async (args) => resolver.list({ kind: "customField", scope: { fieldScope: await parseFieldScope(resolver, args) } }));

  registerJsonTool(server, "weeek_create_custom_field", {
    description: "Create a custom field in a scope (global, a project, a board or a funnel) with a `name` and a `type`: text, number, boolean, datetime, select, multiselect, member, contact, link or approval. Number fields take number_format, precision and currency_id; boolean fields boolean_style. Add a select field's choices with weeek_add_field_option.",
    inputSchema: { ...fieldScopeShape, name: nameText, type: z.enum(fieldTypes), ...fieldConfigShape },
  }, async (args) => {
    const scope = await parseFieldScope(resolver, args);
    const config = buildFieldConfig({ type: args.type, args });
    const field = await client.customFields.create({ scope, field: { name: args.name, type: args.type, config } });
    resolver.forget({ kind: "customField" });
    return field;
  });

  registerJsonTool(server, "weeek_update_custom_field", {
    description: "Rename a custom field (by name or id, inside its scope) or change its number/boolean settings; settings you omit keep their value. The type cannot change.",
    inputSchema: { ...fieldRef, name: nameText.optional(), ...fieldConfigShape },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const config = buildFieldConfig({ type: field.type, args, current: field.config });
    const updated = await client.customFields.update({ scope, fieldId: field.id, update: { name: args.name, config } });
    resolver.forget({ kind: "customField" });
    return updated;
  });

  registerJsonTool(server, "weeek_delete_custom_field", {
    description: "Permanently delete a custom field (by name or id, inside its scope) together with every value held in it. Irreversible; requires confirm:true.",
    inputSchema: { ...fieldRef, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const removal = await client.customFields.remove({ scope, fieldId: field.id });
    resolver.forget({ kind: "customField" });
    return removal;
  });

  registerJsonTool(server, "weeek_transfer_custom_field", {
    description: "Move a global, project or board custom field to another scope: `to` global, a project (`to_project`) or a board (`to_board` by id, or by name with `to_project`). Funnel fields cannot leave their funnel.",
    inputSchema: { ...fieldRef, ...transferShape },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const target = await parseTransferTarget(resolver, args);
    const outcome = await client.customFields.transfer({ scope, fieldId: field.id, target });
    resolver.forget({ kind: "customField" });
    return outcome;
  });

  registerJsonTool(server, "weeek_move_custom_field", {
    description: "Reorder a CRM funnel's custom fields: place `field` right after or right before another field of the same funnel (names or ids; exactly one of the two). Task-manager fields have no order the API exposes.",
    inputSchema: { funnel: nameOrId, field: nameOrId, ...placementShape },
  }, async (args) => {
    const funnelId = await resolver.resolve({ kind: "funnel", value: args.funnel });
    const siblings = await resolver.list({ kind: "customField", scope: { fieldScope: { kind: "funnel", funnelId } } });
    const idOf = (value: string | number) => pickField(siblings, value).id;
    const outcome = await client.customFields.move({ funnelId, fieldId: idOf(args.field), placement: parsePlacement(args, idOf) });
    resolver.forget({ kind: "customField" });
    return outcome;
  });

  registerJsonTool(server, "weeek_add_field_option", {
    description: "Add a choice to a select or multiselect custom field (field by name or id, inside its scope): a `name` and a `color` from WEEEK's palette (blue, light_blue, dark_purple, purple, dark_pink, pink, light_pink, red, turquoise, green, light_green, dark_yellow, yellow).",
    inputSchema: { ...fieldRef, name: nameText, color: optionColor },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const option = await client.customFields.createOption({ scope, fieldId: field.id, option: { name: args.name, color: args.color } });
    resolver.forget({ kind: "customField" });
    return option;
  });

  registerJsonTool(server, "weeek_update_field_option", {
    description: "Rename or recolour one choice of a select/multiselect custom field (option by name or id). Fields you omit keep their current value.",
    inputSchema: { ...optionRef, name: nameText.optional(), color: optionColor.optional() },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const current = pickOption(field, args.option);
    // PUT replaces both fields; the current option is already in hand from the field's list.
    const color = args.color ?? (isOneOf(optionColors, current.color) ? current.color : undefined);
    if (color === undefined) throw new Error(`option "${current.name}" has a colour (${current.color}) outside the palette; pass color to set one`);
    const option = await client.customFields.updateOption({ scope, fieldId: field.id, optionId: current.id, option: { name: args.name ?? current.name, color } });
    resolver.forget({ kind: "customField" });
    return option;
  });

  registerJsonTool(server, "weeek_delete_field_option", {
    description: "Permanently delete one choice of a select/multiselect custom field (option by name or id); tasks that chose it lose that value. Irreversible; requires confirm:true.",
    inputSchema: { ...optionRef, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const removal = await client.customFields.removeOption({ scope, fieldId: field.id, optionId: pickOption(field, args.option).id });
    resolver.forget({ kind: "customField" });
    return removal;
  });

  registerJsonTool(server, "weeek_move_field_option", {
    description: "Reorder the choices of a select/multiselect custom field: place `option` right after or right before another option (names or ids; exactly one of the two).",
    inputSchema: { ...optionRef, ...placementShape },
  }, async (args) => {
    const { scope, field } = await findField(resolver, args);
    const placement = parsePlacement(args, (value) => pickOption(field, value).id);
    const outcome = await client.customFields.moveOption({ scope, fieldId: field.id, optionId: pickOption(field, args.option).id, placement });
    resolver.forget({ kind: "customField" });
    return outcome;
  });
}
