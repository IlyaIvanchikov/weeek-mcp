import { WeeekApiError } from "../errors.js";

/** The API documents several booleans as "use 0 or 1 instead of false or true" (isPrivate, completed, all). */
export function apiFlag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

/** The entity, or null when the API answers 404 — how an id-shaped value is tried before a search. */
export async function orNullWhenMissing<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof WeeekApiError && err.status === 404) return null;
    throw err;
  }
}
