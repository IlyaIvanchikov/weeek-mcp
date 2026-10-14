/** The API documents several booleans as "use 0 or 1 instead of false or true" (isPrivate, completed, all). */
export function apiFlag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}
