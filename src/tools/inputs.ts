import { z } from "zod";

/** A reference the resolver turns into an id: the thing's name, or its id passed straight through. */
export const nameOrId = z.union([z.string(), z.number()]);
export const nameOrIdList = z.array(nameOrId).min(1).max(50);
/** The gate on every destructive tool: the schema rejects the call unless confirm is literally true. */
export const confirmation = z.literal(true).describe("Must be true to confirm this irreversible action.");
export const taskId = z.number().int();
/** The API's date filters are dd.mm.yyyy. */
export const dayMonthYear = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "expected dd.mm.yyyy");
export const page = {
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
};
